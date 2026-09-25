-- JARVIS v0.1 — core memory schema
-- Postgres 15+ with pgvector. Safe to run on a fresh Supabase project.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Provenance: conversations and messages.
-- Every extracted record points back at the message it came from.
-- ---------------------------------------------------------------------------

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

-- Observability for the write pipeline. A failed extraction must never lose the
-- original message: the run is recorded with its error and can be replayed.
create table if not exists extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  model text,
  raw_output jsonb,
  candidate_count integer not null default 0,
  written_count integer not null default 0,
  rejected jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists extraction_runs_message_idx on extraction_runs (message_id);
create index if not exists extraction_runs_status_idx on extraction_runs (user_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Life model
-- ---------------------------------------------------------------------------

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'validation', 'completed', 'graveyard')),
  priority integer not null default 3,
  current_objective text,
  current_milestone text,
  current_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create unique index if not exists projects_user_name_idx on projects (user_id, lower(name));

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  time_horizon text not null default 'medium'
    check (time_horizon in ('short', 'medium', 'long', 'life')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'achieved', 'abandoned')),
  priority integer not null default 3,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists goals_user_title_idx on goals (user_id, lower(title));

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  relationship text,
  context text,
  importance integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_user_name_idx on people (user_id, lower(name));

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text,
  reason text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'blocked', 'done', 'dropped')),
  priority integer not null default 3,
  deadline timestamptz,
  estimated_minutes integer,
  source_type text not null default 'conversation',
  source_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_user_status_idx on tasks (user_id, status, priority);
create index if not exists tasks_project_idx on tasks (project_id, status);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  decision text not null,
  reasoning text,
  alternatives text,
  status text not null default 'active'
    check (status in ('active', 'superseded', 'reversed')),
  superseded_by uuid references decisions(id) on delete set null,
  made_at timestamptz not null default now(),
  source_type text not null default 'conversation',
  source_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists decisions_user_status_idx on decisions (user_id, status, made_at desc);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  event_type text not null,
  title text not null,
  description text,
  occurred_at timestamptz not null default now(),
  source_type text not null default 'conversation',
  source_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists events_user_time_idx on events (user_id, occurred_at desc);
create index if not exists events_project_time_idx on events (project_id, occurred_at desc);

create table if not exists profile_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text not null,
  content text not null,
  confidence numeric(3, 2) not null default 0.80 check (confidence >= 0 and confidence <= 1),
  -- 'explicit' means the user stated it. 'inferred' means JARVIS derived it.
  -- An inference must never be promoted to an explicit fact.
  source_type text not null default 'explicit'
    check (source_type in ('explicit', 'inferred', 'imported', 'manual')),
  source_id uuid references messages(id) on delete set null,
  importance integer not null default 3,
  status text not null default 'active'
    check (status in ('active', 'superseded', 'rejected')),
  superseded_by uuid references profile_facts(id) on delete set null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now()
);

create index if not exists profile_facts_user_status_idx on profile_facts (user_id, status, importance desc);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  content text not null,
  memory_type text not null default 'context'
    check (memory_type in ('context', 'preference', 'insight', 'strategy', 'relationship', 'identity')),
  importance integer not null default 3,
  confidence numeric(3, 2) not null default 0.80 check (confidence >= 0 and confidence <= 1),
  source_type text not null default 'explicit'
    check (source_type in ('explicit', 'inferred', 'imported', 'manual')),
  source_id uuid references messages(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'superseded', 'deleted')),
  -- Old memories are retained, not deleted, so the audit trail survives.
  superseded_by uuid references memories(id) on delete set null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz
);

create index if not exists memories_user_status_idx on memories (user_id, status, importance desc);
create index if not exists memories_project_idx on memories (project_id, status);
create index if not exists memories_embedding_idx on memories
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- Relationships — the beginnings of a personal knowledge graph
-- ---------------------------------------------------------------------------

create table if not exists project_goals (
  project_id uuid not null references projects(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  relation text not null default 'supports',
  created_at timestamptz not null default now(),
  primary key (project_id, goal_id)
);

create table if not exists project_people (
  project_id uuid not null references projects(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  primary key (project_id, person_id)
);

create table if not exists task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists memory_entities (
  memory_id uuid not null references memories(id) on delete cascade,
  entity_type text not null check (entity_type in ('project', 'person', 'goal', 'task', 'decision')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (memory_id, entity_type, entity_id)
);

-- ---------------------------------------------------------------------------
-- Vector search
-- ---------------------------------------------------------------------------

create or replace function match_memories(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 8,
  p_min_importance integer default 1,
  p_project_id uuid default null
)
returns table (
  id uuid,
  content text,
  memory_type text,
  importance integer,
  confidence numeric,
  source_type text,
  source_id uuid,
  project_id uuid,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    m.id,
    m.content,
    m.memory_type,
    m.importance,
    m.confidence,
    m.source_type,
    m.source_id,
    m.project_id,
    m.created_at,
    1 - (m.embedding <=> p_query_embedding) as similarity
  from memories m
  where m.user_id = p_user_id
    and m.status = 'active'          -- superseded memories never surface as current truth
    and m.embedding is not null
    and m.importance >= p_min_importance
    and (p_project_id is null or m.project_id = p_project_id)
  order by m.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- All access in v0.1 is server-side with the service role key, which bypasses
-- RLS. Enabling it with no policies means a leaked anon key reads nothing.
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table extraction_runs enable row level security;
alter table projects enable row level security;
alter table goals enable row level security;
alter table people enable row level security;
alter table tasks enable row level security;
alter table decisions enable row level security;
alter table events enable row level security;
alter table profile_facts enable row level security;
alter table memories enable row level security;
alter table project_goals enable row level security;
alter table project_people enable row level security;
alter table task_dependencies enable row level security;
alter table memory_entities enable row level security;
