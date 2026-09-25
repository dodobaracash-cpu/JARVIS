export type Uuid = string;
export type Timestamp = string;

/**
 * How a record came to exist. `explicit` = the user said it. `inferred` = JARVIS
 * derived it from a pattern. The two must never be collapsed.
 */
export type SourceType = 'explicit' | 'inferred' | 'imported' | 'manual';

export type RecordStatus = 'active' | 'superseded' | 'rejected' | 'deleted';

export interface User {
  id: Uuid;
  name: string;
  timezone: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Conversation {
  id: Uuid;
  user_id: Uuid;
  title: string | null;
  started_at: Timestamp;
  last_message_at: Timestamp;
}

export interface Message {
  id: Uuid;
  conversation_id: Uuid;
  user_id: Uuid;
  role: 'user' | 'assistant';
  content: string;
  created_at: Timestamp;
}

export type ExtractionStatus = 'pending' | 'succeeded' | 'failed';

export interface ExtractionRun {
  id: Uuid;
  user_id: Uuid;
  message_id: Uuid;
  status: ExtractionStatus;
  model: string | null;
  raw_output: unknown;
  candidate_count: number;
  written_count: number;
  rejected: RejectedCandidate[] | null;
  error: string | null;
  created_at: Timestamp;
  finished_at: Timestamp | null;
}

export interface RejectedCandidate {
  kind: string;
  summary: string;
  reason: string;
}

export type ProjectStatus = 'active' | 'paused' | 'validation' | 'completed' | 'graveyard';

export interface Project {
  id: Uuid;
  user_id: Uuid;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: number;
  current_objective: string | null;
  current_milestone: string | null;
  current_state: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_activity_at: Timestamp;
}

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'dropped';

export interface Task {
  id: Uuid;
  user_id: Uuid;
  project_id: Uuid | null;
  title: string;
  description: string | null;
  reason: string | null;
  status: TaskStatus;
  priority: number;
  deadline: Timestamp | null;
  estimated_minutes: number | null;
  source_type: string;
  source_id: Uuid | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at: Timestamp | null;
}

export type GoalStatus = 'active' | 'paused' | 'achieved' | 'abandoned';
export type TimeHorizon = 'short' | 'medium' | 'long' | 'life';

export interface Goal {
  id: Uuid;
  user_id: Uuid;
  title: string;
  description: string | null;
  time_horizon: TimeHorizon;
  status: GoalStatus;
  priority: number;
  target_date: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Person {
  id: Uuid;
  user_id: Uuid;
  name: string;
  relationship: string | null;
  context: string | null;
  importance: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type DecisionStatus = 'active' | 'superseded' | 'reversed';

export interface Decision {
  id: Uuid;
  user_id: Uuid;
  project_id: Uuid | null;
  title: string;
  decision: string;
  reasoning: string | null;
  alternatives: string | null;
  status: DecisionStatus;
  superseded_by: Uuid | null;
  made_at: Timestamp;
  source_type: string;
  source_id: Uuid | null;
  created_at: Timestamp;
}

export interface LifeEvent {
  id: Uuid;
  user_id: Uuid;
  project_id: Uuid | null;
  event_type: string;
  title: string;
  description: string | null;
  occurred_at: Timestamp;
  source_type: string;
  source_id: Uuid | null;
  created_at: Timestamp;
}

export interface ProfileFact {
  id: Uuid;
  user_id: Uuid;
  category: string;
  content: string;
  confidence: number;
  source_type: SourceType;
  source_id: Uuid | null;
  importance: number;
  status: 'active' | 'superseded' | 'rejected';
  superseded_by: Uuid | null;
  embedding: number[] | null;
  created_at: Timestamp;
  last_confirmed_at: Timestamp;
}

export type MemoryType =
  | 'context'
  | 'preference'
  | 'insight'
  | 'strategy'
  | 'relationship'
  | 'identity';

export interface MemoryRecord {
  id: Uuid;
  user_id: Uuid;
  project_id: Uuid | null;
  content: string;
  memory_type: MemoryType;
  importance: number;
  confidence: number;
  source_type: SourceType;
  source_id: Uuid | null;
  status: 'active' | 'superseded' | 'deleted';
  superseded_by: Uuid | null;
  embedding: number[] | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_accessed_at: Timestamp | null;
}

export interface ScoredMemory extends MemoryRecord {
  similarity: number;
}

export type EntityType = 'project' | 'person' | 'goal' | 'task' | 'decision';

export interface MemoryEntityLink {
  memory_id: Uuid;
  entity_type: EntityType;
  entity_id: Uuid;
}
