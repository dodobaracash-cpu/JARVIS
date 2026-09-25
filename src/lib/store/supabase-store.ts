import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { New, Store, TaskStatusFilter } from '@/lib/store/store';
import type {
  Conversation,
  Decision,
  EntityType,
  ExtractionRun,
  ExtractionStatus,
  Goal,
  LifeEvent,
  MemoryRecord,
  Message,
  Person,
  ProfileFact,
  Project,
  ScoredMemory,
  Task,
  User,
  Uuid,
} from '@/lib/types';

const UNFINISHED = ['open', 'in_progress', 'blocked'];

/** pgvector comes back over PostgREST as a string like "[0.1,0.2]". */
function parseEmbedding(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value as number[];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

function serializeEmbedding(value: number[] | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value);
}

function withEmbedding<T extends { embedding?: unknown }>(row: T): T {
  return { ...row, embedding: parseEmbedding(row.embedding) };
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(client?: SupabaseClient) {
    if (client) {
      this.db = client;
      return;
    }
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }
    this.db = createClient(url, key, { auth: { persistSession: false } });
  }

  private async one<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    if (!data) throw new Error('query returned no row');
    return data;
  }

  private async maybe<T>(
    promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  ): Promise<T | null> {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
  }

  private async many<T>(
    promise: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async ensureUser(input: { name: string; timezone?: string }): Promise<User> {
    const existing = await this.maybe<User>(
      this.db.from('users').select('*').eq('name', input.name).maybeSingle(),
    );
    if (existing) return existing;
    return this.one<User>(
      this.db
        .from('users')
        .insert({ name: input.name, timezone: input.timezone ?? 'UTC' })
        .select()
        .single(),
    );
  }

  async getUser(id: Uuid) {
    return this.maybe<User>(this.db.from('users').select('*').eq('id', id).maybeSingle());
  }

  async getDefaultUser() {
    return this.maybe<User>(
      this.db.from('users').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    );
  }

  async createConversation(input: { user_id: Uuid; title?: string | null }) {
    return this.one<Conversation>(
      this.db
        .from('conversations')
        .insert({ user_id: input.user_id, title: input.title ?? null })
        .select()
        .single(),
    );
  }

  async getConversation(id: Uuid) {
    return this.maybe<Conversation>(
      this.db.from('conversations').select('*').eq('id', id).maybeSingle(),
    );
  }

  async listConversations(userId: Uuid, limit = 20) {
    return this.many<Conversation>(
      this.db
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false })
        .limit(limit),
    );
  }

  async touchConversation(id: Uuid) {
    const { error } = await this.db
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async addMessage(input: {
    conversation_id: Uuid;
    user_id: Uuid;
    role: 'user' | 'assistant';
    content: string;
  }) {
    const message = await this.one<Message>(
      this.db.from('messages').insert(input).select().single(),
    );
    await this.touchConversation(input.conversation_id);
    return message;
  }

  async getMessage(id: Uuid) {
    return this.maybe<Message>(this.db.from('messages').select('*').eq('id', id).maybeSingle());
  }

  async listMessages(conversationId: Uuid, limit = 50) {
    const rows = await this.many<Message>(
      this.db
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit),
    );
    return rows.reverse();
  }

  async createExtractionRun(input: { user_id: Uuid; message_id: Uuid; model?: string | null }) {
    return this.one<ExtractionRun>(
      this.db
        .from('extraction_runs')
        .insert({ ...input, model: input.model ?? null, status: 'pending' })
        .select()
        .single(),
    );
  }

  async finishExtractionRun(id: Uuid, patch: Partial<ExtractionRun> & { status: ExtractionStatus }) {
    return this.one<ExtractionRun>(
      this.db
        .from('extraction_runs')
        .update({ ...patch, finished_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    );
  }

  async listExtractionRuns(userId: Uuid, opts: { status?: ExtractionStatus; limit?: number } = {}) {
    let query = this.db
      .from('extraction_runs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 20);
    if (opts.status) query = query.eq('status', opts.status);
    return this.many<ExtractionRun>(query);
  }

  async listProjects(userId: Uuid, opts: { status?: string; limit?: number } = {}) {
    let query = this.db
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('last_activity_at', { ascending: false })
      .limit(opts.limit ?? 50);
    if (opts.status) query = query.eq('status', opts.status);
    return this.many<Project>(query);
  }

  async findProjectByName(userId: Uuid, name: string) {
    return this.maybe<Project>(
      this.db
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .ilike('name', name.trim())
        .maybeSingle(),
    );
  }

  async getProject(id: Uuid) {
    return this.maybe<Project>(this.db.from('projects').select('*').eq('id', id).maybeSingle());
  }

  async createProject(input: New<Project>) {
    return this.one<Project>(this.db.from('projects').insert(input).select().single());
  }

  async updateProject(id: Uuid, patch: Partial<Project>) {
    return this.one<Project>(
      this.db
        .from('projects')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    );
  }

  async listTasks(
    userId: Uuid,
    opts: { projectId?: Uuid | null; status?: TaskStatusFilter; limit?: number } = {},
  ) {
    let query = this.db
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 50);
    if (opts.projectId !== undefined) {
      query = opts.projectId === null ? query.is('project_id', null) : query.eq('project_id', opts.projectId);
    }
    if (opts.status === 'unfinished') query = query.in('status', UNFINISHED);
    else if (opts.status) query = query.eq('status', opts.status);
    return this.many<Task>(query);
  }

  async findTaskByTitle(userId: Uuid, title: string) {
    return this.maybe<Task>(
      this.db.from('tasks').select('*').eq('user_id', userId).ilike('title', title.trim()).limit(1).maybeSingle(),
    );
  }

  async createTask(input: New<Task>) {
    return this.one<Task>(this.db.from('tasks').insert(input).select().single());
  }

  async updateTask(id: Uuid, patch: Partial<Task>) {
    return this.one<Task>(
      this.db
        .from('tasks')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    );
  }

  async listGoals(userId: Uuid, opts: { status?: string; limit?: number } = {}) {
    let query = this.db
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('priority', { ascending: true })
      .limit(opts.limit ?? 50);
    if (opts.status) query = query.eq('status', opts.status);
    return this.many<Goal>(query);
  }

  async findGoalByTitle(userId: Uuid, title: string) {
    return this.maybe<Goal>(
      this.db.from('goals').select('*').eq('user_id', userId).ilike('title', title.trim()).maybeSingle(),
    );
  }

  async createGoal(input: New<Goal>) {
    return this.one<Goal>(this.db.from('goals').insert(input).select().single());
  }

  async updateGoal(id: Uuid, patch: Partial<Goal>) {
    return this.one<Goal>(
      this.db
        .from('goals')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    );
  }

  async listPeople(userId: Uuid, limit = 50) {
    return this.many<Person>(
      this.db
        .from('people')
        .select('*')
        .eq('user_id', userId)
        .order('importance', { ascending: false })
        .limit(limit),
    );
  }

  async findPersonByName(userId: Uuid, name: string) {
    return this.maybe<Person>(
      this.db.from('people').select('*').eq('user_id', userId).ilike('name', name.trim()).maybeSingle(),
    );
  }

  async createPerson(input: New<Person>) {
    return this.one<Person>(this.db.from('people').insert(input).select().single());
  }

  async updatePerson(id: Uuid, patch: Partial<Person>) {
    return this.one<Person>(
      this.db
        .from('people')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    );
  }

  async listDecisions(
    userId: Uuid,
    opts: { projectId?: Uuid | null; status?: string; limit?: number } = {},
  ) {
    let query = this.db
      .from('decisions')
      .select('*')
      .eq('user_id', userId)
      .order('made_at', { ascending: false })
      .limit(opts.limit ?? 50);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.projectId !== undefined) {
      query = opts.projectId === null ? query.is('project_id', null) : query.eq('project_id', opts.projectId);
    }
    return this.many<Decision>(query);
  }

  async findDecisionByTitle(userId: Uuid, title: string) {
    return this.maybe<Decision>(
      this.db
        .from('decisions')
        .select('*')
        .eq('user_id', userId)
        .ilike('title', title.trim())
        .limit(1)
        .maybeSingle(),
    );
  }

  async createDecision(input: New<Decision>) {
    return this.one<Decision>(this.db.from('decisions').insert(input).select().single());
  }

  async updateDecision(id: Uuid, patch: Partial<Decision>) {
    return this.one<Decision>(
      this.db.from('decisions').update(patch).eq('id', id).select().single(),
    );
  }

  async listEvents(
    userId: Uuid,
    opts: { projectId?: Uuid | null; since?: string; limit?: number } = {},
  ) {
    let query = this.db
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(opts.limit ?? 50);
    if (opts.projectId !== undefined) {
      query = opts.projectId === null ? query.is('project_id', null) : query.eq('project_id', opts.projectId);
    }
    if (opts.since) query = query.gte('occurred_at', opts.since);
    return this.many<LifeEvent>(query);
  }

  async createEvent(input: New<LifeEvent>) {
    return this.one<LifeEvent>(this.db.from('events').insert(input).select().single());
  }

  async listProfileFacts(
    userId: Uuid,
    opts: { status?: string; category?: string; limit?: number } = {},
  ) {
    let query = this.db
      .from('profile_facts')
      .select('*')
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 50);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.category) query = query.eq('category', opts.category);
    return (await this.many<ProfileFact>(query)).map(withEmbedding);
  }

  async createProfileFact(input: New<ProfileFact>) {
    const row = await this.one<ProfileFact>(
      this.db
        .from('profile_facts')
        .insert({ ...input, embedding: serializeEmbedding(input.embedding) })
        .select()
        .single(),
    );
    return withEmbedding(row);
  }

  async updateProfileFact(id: Uuid, patch: Partial<ProfileFact>) {
    const payload: Record<string, unknown> = { ...patch };
    if ('embedding' in patch) payload.embedding = serializeEmbedding(patch.embedding);
    const row = await this.one<ProfileFact>(
      this.db.from('profile_facts').update(payload).eq('id', id).select().single(),
    );
    return withEmbedding(row);
  }

  async listMemories(
    userId: Uuid,
    opts: { status?: string; projectId?: Uuid | null; limit?: number } = {},
  ) {
    let query = this.db
      .from('memories')
      .select('*')
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 50);
    if (opts.status) query = query.eq('status', opts.status);
    if (opts.projectId !== undefined) {
      query = opts.projectId === null ? query.is('project_id', null) : query.eq('project_id', opts.projectId);
    }
    return (await this.many<MemoryRecord>(query)).map(withEmbedding);
  }

  async getMemory(id: Uuid) {
    const row = await this.maybe<MemoryRecord>(
      this.db.from('memories').select('*').eq('id', id).maybeSingle(),
    );
    return row ? withEmbedding(row) : null;
  }

  async createMemory(input: New<MemoryRecord>) {
    const row = await this.one<MemoryRecord>(
      this.db
        .from('memories')
        .insert({ ...input, embedding: serializeEmbedding(input.embedding) })
        .select()
        .single(),
    );
    return withEmbedding(row);
  }

  async updateMemory(id: Uuid, patch: Partial<MemoryRecord>) {
    const payload: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if ('embedding' in patch) payload.embedding = serializeEmbedding(patch.embedding);
    const row = await this.one<MemoryRecord>(
      this.db.from('memories').update(payload).eq('id', id).select().single(),
    );
    return withEmbedding(row);
  }

  async searchMemories(
    userId: Uuid,
    embedding: number[],
    opts: { limit?: number; projectId?: Uuid | null; minImportance?: number } = {},
  ): Promise<ScoredMemory[]> {
    const { data, error } = await this.db.rpc('match_memories', {
      p_user_id: userId,
      p_query_embedding: serializeEmbedding(embedding),
      p_match_count: opts.limit ?? 8,
      p_min_importance: opts.minImportance ?? 1,
      p_project_id: opts.projectId ?? null,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ScoredMemory[]).map((row) => ({
      ...withEmbedding(row),
      similarity: Number(row.similarity),
    }));
  }

  async linkMemoryEntity(memoryId: Uuid, entityType: EntityType, entityId: Uuid) {
    const { error } = await this.db
      .from('memory_entities')
      .upsert(
        { memory_id: memoryId, entity_type: entityType, entity_id: entityId },
        { onConflict: 'memory_id,entity_type,entity_id' },
      );
    if (error) throw new Error(error.message);
  }

  async listMemoryEntityLinks(memoryId: Uuid) {
    return this.many<{ entity_type: EntityType; entity_id: Uuid }>(
      this.db.from('memory_entities').select('entity_type, entity_id').eq('memory_id', memoryId),
    );
  }

  async linkProjectGoal(projectId: Uuid, goalId: Uuid, relation = 'supports') {
    const { error } = await this.db
      .from('project_goals')
      .upsert({ project_id: projectId, goal_id: goalId, relation }, { onConflict: 'project_id,goal_id' });
    if (error) throw new Error(error.message);
  }

  async linkProjectPerson(projectId: Uuid, personId: Uuid, role: string | null = null) {
    const { error } = await this.db
      .from('project_people')
      .upsert({ project_id: projectId, person_id: personId, role }, { onConflict: 'project_id,person_id' });
    if (error) throw new Error(error.message);
  }
}
