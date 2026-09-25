import { randomUUID } from 'node:crypto';
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
import type { New, Store, TaskStatusFilter } from '@/lib/store/store';
import { cosineSimilarity } from '@/lib/llm/similarity';

const UNFINISHED: string[] = ['open', 'in_progress', 'blocked'];

/**
 * Reference implementation of Store backed by plain arrays. Used by the test
 * suite so memory behaviour can be asserted without a database, and useful as
 * an executable spec of what SupabaseStore must do.
 */
export class InMemoryStore implements Store {
  private clock: () => string;

  users: User[] = [];
  conversations: Conversation[] = [];
  messages: Message[] = [];
  extractionRuns: ExtractionRun[] = [];
  projects: Project[] = [];
  tasks: Task[] = [];
  goals: Goal[] = [];
  people: Person[] = [];
  decisions: Decision[] = [];
  events: LifeEvent[] = [];
  profileFacts: ProfileFact[] = [];
  memories: MemoryRecord[] = [];
  memoryEntities: { memory_id: Uuid; entity_type: EntityType; entity_id: Uuid }[] = [];
  projectGoals: { project_id: Uuid; goal_id: Uuid; relation: string }[] = [];
  projectPeople: { project_id: Uuid; person_id: Uuid; role: string | null }[] = [];

  constructor(opts: { clock?: () => string } = {}) {
    // A monotonic fake clock keeps ordering assertions deterministic in tests.
    let tick = 0;
    this.clock = opts.clock ?? (() => new Date(Date.UTC(2026, 0, 1) + tick++ * 1000).toISOString());
  }

  now(): string {
    return this.clock();
  }

  async ensureUser(input: { name: string; timezone?: string }): Promise<User> {
    const existing = this.users.find((u) => u.name === input.name);
    if (existing) return existing;
    const now = this.now();
    const user: User = {
      id: randomUUID(),
      name: input.name,
      timezone: input.timezone ?? 'UTC',
      created_at: now,
      updated_at: now,
    };
    this.users.push(user);
    return user;
  }

  async getUser(id: Uuid) {
    return this.users.find((u) => u.id === id) ?? null;
  }

  async getDefaultUser() {
    return this.users[0] ?? null;
  }

  async createConversation(input: { user_id: Uuid; title?: string | null }) {
    const now = this.now();
    const conversation: Conversation = {
      id: randomUUID(),
      user_id: input.user_id,
      title: input.title ?? null,
      started_at: now,
      last_message_at: now,
    };
    this.conversations.push(conversation);
    return conversation;
  }

  async getConversation(id: Uuid) {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async listConversations(userId: Uuid, limit = 20) {
    return this.conversations
      .filter((c) => c.user_id === userId)
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
      .slice(0, limit);
  }

  async touchConversation(id: Uuid) {
    const conversation = this.conversations.find((c) => c.id === id);
    if (conversation) conversation.last_message_at = this.now();
  }

  async addMessage(input: {
    conversation_id: Uuid;
    user_id: Uuid;
    role: 'user' | 'assistant';
    content: string;
  }) {
    const message: Message = { id: randomUUID(), created_at: this.now(), ...input };
    this.messages.push(message);
    await this.touchConversation(input.conversation_id);
    return message;
  }

  async getMessage(id: Uuid) {
    return this.messages.find((m) => m.id === id) ?? null;
  }

  async listMessages(conversationId: Uuid, limit = 50) {
    return this.messages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-limit);
  }

  async createExtractionRun(input: { user_id: Uuid; message_id: Uuid; model?: string | null }) {
    const run: ExtractionRun = {
      id: randomUUID(),
      user_id: input.user_id,
      message_id: input.message_id,
      status: 'pending',
      model: input.model ?? null,
      raw_output: null,
      candidate_count: 0,
      written_count: 0,
      rejected: null,
      error: null,
      created_at: this.now(),
      finished_at: null,
    };
    this.extractionRuns.push(run);
    return run;
  }

  async finishExtractionRun(id: Uuid, patch: Partial<ExtractionRun> & { status: ExtractionStatus }) {
    const run = this.extractionRuns.find((r) => r.id === id);
    if (!run) throw new Error(`extraction run ${id} not found`);
    Object.assign(run, patch, { finished_at: this.now() });
    return run;
  }

  async listExtractionRuns(userId: Uuid, opts: { status?: ExtractionStatus; limit?: number } = {}) {
    return this.extractionRuns
      .filter((r) => r.user_id === userId && (!opts.status || r.status === opts.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, opts.limit ?? 20);
  }

  async listProjects(userId: Uuid, opts: { status?: string; limit?: number } = {}) {
    return this.projects
      .filter((p) => p.user_id === userId && (!opts.status || p.status === opts.status))
      .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
      .slice(0, opts.limit ?? 50);
  }

  async findProjectByName(userId: Uuid, name: string) {
    const needle = name.trim().toLowerCase();
    return (
      this.projects.find((p) => p.user_id === userId && p.name.trim().toLowerCase() === needle) ?? null
    );
  }

  async getProject(id: Uuid) {
    return this.projects.find((p) => p.id === id) ?? null;
  }

  async createProject(input: New<Project>) {
    const now = this.now();
    const project: Project = { id: randomUUID(), created_at: now, updated_at: now, ...input };
    this.projects.push(project);
    return project;
  }

  async updateProject(id: Uuid, patch: Partial<Project>) {
    const project = this.projects.find((p) => p.id === id);
    if (!project) throw new Error(`project ${id} not found`);
    Object.assign(project, patch, { updated_at: this.now() });
    return project;
  }

  async listTasks(
    userId: Uuid,
    opts: { projectId?: Uuid | null; status?: TaskStatusFilter; limit?: number } = {},
  ) {
    return this.tasks
      .filter((t) => {
        if (t.user_id !== userId) return false;
        if (opts.projectId !== undefined && t.project_id !== opts.projectId) return false;
        if (opts.status === 'unfinished') return UNFINISHED.includes(t.status);
        if (opts.status) return t.status === opts.status;
        return true;
      })
      .sort((a, b) => a.priority - b.priority || b.created_at.localeCompare(a.created_at))
      .slice(0, opts.limit ?? 50);
  }

  async findTaskByTitle(userId: Uuid, title: string) {
    const needle = title.trim().toLowerCase();
    return this.tasks.find((t) => t.user_id === userId && t.title.trim().toLowerCase() === needle) ?? null;
  }

  async createTask(input: New<Task>) {
    const now = this.now();
    const task: Task = { id: randomUUID(), created_at: now, updated_at: now, ...input };
    this.tasks.push(task);
    return task;
  }

  async updateTask(id: Uuid, patch: Partial<Task>) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new Error(`task ${id} not found`);
    Object.assign(task, patch, { updated_at: this.now() });
    return task;
  }

  async listGoals(userId: Uuid, opts: { status?: string; limit?: number } = {}) {
    return this.goals
      .filter((g) => g.user_id === userId && (!opts.status || g.status === opts.status))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, opts.limit ?? 50);
  }

  async findGoalByTitle(userId: Uuid, title: string) {
    const needle = title.trim().toLowerCase();
    return this.goals.find((g) => g.user_id === userId && g.title.trim().toLowerCase() === needle) ?? null;
  }

  async createGoal(input: New<Goal>) {
    const now = this.now();
    const goal: Goal = { id: randomUUID(), created_at: now, updated_at: now, ...input };
    this.goals.push(goal);
    return goal;
  }

  async updateGoal(id: Uuid, patch: Partial<Goal>) {
    const goal = this.goals.find((g) => g.id === id);
    if (!goal) throw new Error(`goal ${id} not found`);
    Object.assign(goal, patch, { updated_at: this.now() });
    return goal;
  }

  async listPeople(userId: Uuid, limit = 50) {
    return this.people.filter((p) => p.user_id === userId).slice(0, limit);
  }

  async findPersonByName(userId: Uuid, name: string) {
    const needle = name.trim().toLowerCase();
    return this.people.find((p) => p.user_id === userId && p.name.trim().toLowerCase() === needle) ?? null;
  }

  async createPerson(input: New<Person>) {
    const now = this.now();
    const person: Person = { id: randomUUID(), created_at: now, updated_at: now, ...input };
    this.people.push(person);
    return person;
  }

  async updatePerson(id: Uuid, patch: Partial<Person>) {
    const person = this.people.find((p) => p.id === id);
    if (!person) throw new Error(`person ${id} not found`);
    Object.assign(person, patch, { updated_at: this.now() });
    return person;
  }

  async listDecisions(
    userId: Uuid,
    opts: { projectId?: Uuid | null; status?: string; limit?: number } = {},
  ) {
    return this.decisions
      .filter((d) => {
        if (d.user_id !== userId) return false;
        if (opts.projectId !== undefined && d.project_id !== opts.projectId) return false;
        if (opts.status && d.status !== opts.status) return false;
        return true;
      })
      .sort((a, b) => b.made_at.localeCompare(a.made_at))
      .slice(0, opts.limit ?? 50);
  }

  async findDecisionByTitle(userId: Uuid, title: string) {
    const needle = title.trim().toLowerCase();
    return (
      this.decisions.find((d) => d.user_id === userId && d.title.trim().toLowerCase() === needle) ?? null
    );
  }

  async createDecision(input: New<Decision>) {
    const decision: Decision = { id: randomUUID(), created_at: this.now(), ...input };
    this.decisions.push(decision);
    return decision;
  }

  async updateDecision(id: Uuid, patch: Partial<Decision>) {
    const decision = this.decisions.find((d) => d.id === id);
    if (!decision) throw new Error(`decision ${id} not found`);
    Object.assign(decision, patch);
    return decision;
  }

  async listEvents(
    userId: Uuid,
    opts: { projectId?: Uuid | null; since?: string; limit?: number } = {},
  ) {
    return this.events
      .filter((e) => {
        if (e.user_id !== userId) return false;
        if (opts.projectId !== undefined && e.project_id !== opts.projectId) return false;
        if (opts.since && e.occurred_at < opts.since) return false;
        return true;
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, opts.limit ?? 50);
  }

  async createEvent(input: New<LifeEvent>) {
    const event: LifeEvent = { id: randomUUID(), created_at: this.now(), ...input };
    this.events.push(event);
    return event;
  }

  async listProfileFacts(
    userId: Uuid,
    opts: { status?: string; category?: string; limit?: number } = {},
  ) {
    return this.profileFacts
      .filter((f) => {
        if (f.user_id !== userId) return false;
        if (opts.status && f.status !== opts.status) return false;
        if (opts.category && f.category !== opts.category) return false;
        return true;
      })
      .sort((a, b) => b.importance - a.importance || b.created_at.localeCompare(a.created_at))
      .slice(0, opts.limit ?? 50);
  }

  async createProfileFact(input: New<ProfileFact>) {
    const fact: ProfileFact = { id: randomUUID(), created_at: this.now(), ...input };
    this.profileFacts.push(fact);
    return fact;
  }

  async updateProfileFact(id: Uuid, patch: Partial<ProfileFact>) {
    const fact = this.profileFacts.find((f) => f.id === id);
    if (!fact) throw new Error(`profile fact ${id} not found`);
    Object.assign(fact, patch);
    return fact;
  }

  async listMemories(
    userId: Uuid,
    opts: { status?: string; projectId?: Uuid | null; limit?: number } = {},
  ) {
    return this.memories
      .filter((m) => {
        if (m.user_id !== userId) return false;
        if (opts.status && m.status !== opts.status) return false;
        if (opts.projectId !== undefined && m.project_id !== opts.projectId) return false;
        return true;
      })
      .sort((a, b) => b.importance - a.importance || b.created_at.localeCompare(a.created_at))
      .slice(0, opts.limit ?? 50);
  }

  async getMemory(id: Uuid) {
    return this.memories.find((m) => m.id === id) ?? null;
  }

  async createMemory(input: New<MemoryRecord>) {
    const now = this.now();
    const memory: MemoryRecord = { id: randomUUID(), created_at: now, updated_at: now, ...input };
    this.memories.push(memory);
    return memory;
  }

  async updateMemory(id: Uuid, patch: Partial<MemoryRecord>) {
    const memory = this.memories.find((m) => m.id === id);
    if (!memory) throw new Error(`memory ${id} not found`);
    Object.assign(memory, patch, { updated_at: this.now() });
    return memory;
  }

  async searchMemories(
    userId: Uuid,
    embedding: number[],
    opts: { limit?: number; projectId?: Uuid | null; minImportance?: number } = {},
  ): Promise<ScoredMemory[]> {
    return this.memories
      .filter((m) => {
        if (m.user_id !== userId) return false;
        if (m.status !== 'active') return false; // superseded memories are never current truth
        if (!m.embedding) return false;
        if (opts.minImportance && m.importance < opts.minImportance) return false;
        if (opts.projectId != null && m.project_id !== opts.projectId) return false;
        return true;
      })
      .map((m) => ({ ...m, similarity: cosineSimilarity(embedding, m.embedding!) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.limit ?? 8);
  }

  async linkMemoryEntity(memoryId: Uuid, entityType: EntityType, entityId: Uuid) {
    const exists = this.memoryEntities.some(
      (l) => l.memory_id === memoryId && l.entity_type === entityType && l.entity_id === entityId,
    );
    if (!exists) this.memoryEntities.push({ memory_id: memoryId, entity_type: entityType, entity_id: entityId });
  }

  async listMemoryEntityLinks(memoryId: Uuid) {
    return this.memoryEntities
      .filter((l) => l.memory_id === memoryId)
      .map((l) => ({ entity_type: l.entity_type, entity_id: l.entity_id }));
  }

  async linkProjectGoal(projectId: Uuid, goalId: Uuid, relation = 'supports') {
    const exists = this.projectGoals.some((l) => l.project_id === projectId && l.goal_id === goalId);
    if (!exists) this.projectGoals.push({ project_id: projectId, goal_id: goalId, relation });
  }

  async linkProjectPerson(projectId: Uuid, personId: Uuid, role: string | null = null) {
    const exists = this.projectPeople.some((l) => l.project_id === projectId && l.person_id === personId);
    if (!exists) this.projectPeople.push({ project_id: projectId, person_id: personId, role });
  }
}
