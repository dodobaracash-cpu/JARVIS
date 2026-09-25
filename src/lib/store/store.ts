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

/** Fields the caller supplies; the store owns ids and timestamps. */
export type New<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

export interface MemoryQuery {
  status?: string;
  projectId?: Uuid | null;
  limit?: number;
}

/**
 * The single seam between JARVIS and its storage. The Supabase implementation
 * is what runs; the in-memory implementation is what the test suite runs, which
 * is why every method here is storage-agnostic.
 */
export interface Store {
  ensureUser(input: { name: string; timezone?: string }): Promise<User>;
  getUser(id: Uuid): Promise<User | null>;
  getDefaultUser(): Promise<User | null>;

  createConversation(input: { user_id: Uuid; title?: string | null }): Promise<Conversation>;
  getConversation(id: Uuid): Promise<Conversation | null>;
  listConversations(userId: Uuid, limit?: number): Promise<Conversation[]>;
  touchConversation(id: Uuid): Promise<void>;

  addMessage(input: {
    conversation_id: Uuid;
    user_id: Uuid;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<Message>;
  getMessage(id: Uuid): Promise<Message | null>;
  listMessages(conversationId: Uuid, limit?: number): Promise<Message[]>;

  createExtractionRun(input: { user_id: Uuid; message_id: Uuid; model?: string | null }): Promise<ExtractionRun>;
  finishExtractionRun(
    id: Uuid,
    patch: Partial<Pick<ExtractionRun, 'status' | 'raw_output' | 'candidate_count' | 'written_count' | 'rejected' | 'error'>> & {
      status: ExtractionStatus;
    },
  ): Promise<ExtractionRun>;
  listExtractionRuns(userId: Uuid, opts?: { status?: ExtractionStatus; limit?: number }): Promise<ExtractionRun[]>;

  listProjects(userId: Uuid, opts?: { status?: string; limit?: number }): Promise<Project[]>;
  findProjectByName(userId: Uuid, name: string): Promise<Project | null>;
  getProject(id: Uuid): Promise<Project | null>;
  createProject(input: New<Project>): Promise<Project>;
  updateProject(id: Uuid, patch: Partial<Project>): Promise<Project>;

  listTasks(userId: Uuid, opts?: { projectId?: Uuid | null; status?: TaskStatusFilter; limit?: number }): Promise<Task[]>;
  findTaskByTitle(userId: Uuid, title: string): Promise<Task | null>;
  createTask(input: New<Task>): Promise<Task>;
  updateTask(id: Uuid, patch: Partial<Task>): Promise<Task>;

  listGoals(userId: Uuid, opts?: { status?: string; limit?: number }): Promise<Goal[]>;
  findGoalByTitle(userId: Uuid, title: string): Promise<Goal | null>;
  createGoal(input: New<Goal>): Promise<Goal>;
  updateGoal(id: Uuid, patch: Partial<Goal>): Promise<Goal>;

  listPeople(userId: Uuid, limit?: number): Promise<Person[]>;
  findPersonByName(userId: Uuid, name: string): Promise<Person | null>;
  createPerson(input: New<Person>): Promise<Person>;
  updatePerson(id: Uuid, patch: Partial<Person>): Promise<Person>;

  listDecisions(
    userId: Uuid,
    opts?: { projectId?: Uuid | null; status?: string; limit?: number },
  ): Promise<Decision[]>;
  findDecisionByTitle(userId: Uuid, title: string): Promise<Decision | null>;
  createDecision(input: New<Decision>): Promise<Decision>;
  updateDecision(id: Uuid, patch: Partial<Decision>): Promise<Decision>;

  listEvents(
    userId: Uuid,
    opts?: { projectId?: Uuid | null; since?: string; limit?: number },
  ): Promise<LifeEvent[]>;
  createEvent(input: New<LifeEvent>): Promise<LifeEvent>;

  listProfileFacts(
    userId: Uuid,
    opts?: { status?: string; category?: string; limit?: number },
  ): Promise<ProfileFact[]>;
  createProfileFact(input: New<ProfileFact>): Promise<ProfileFact>;
  updateProfileFact(id: Uuid, patch: Partial<ProfileFact>): Promise<ProfileFact>;

  listMemories(
    userId: Uuid,
    opts?: { status?: string; projectId?: Uuid | null; limit?: number },
  ): Promise<MemoryRecord[]>;
  getMemory(id: Uuid): Promise<MemoryRecord | null>;
  createMemory(input: New<MemoryRecord>): Promise<MemoryRecord>;
  updateMemory(id: Uuid, patch: Partial<MemoryRecord>): Promise<MemoryRecord>;
  searchMemories(
    userId: Uuid,
    embedding: number[],
    opts?: { limit?: number; projectId?: Uuid | null; minImportance?: number },
  ): Promise<ScoredMemory[]>;

  linkMemoryEntity(memoryId: Uuid, entityType: EntityType, entityId: Uuid): Promise<void>;
  listMemoryEntityLinks(memoryId: Uuid): Promise<{ entity_type: EntityType; entity_id: Uuid }[]>;
  linkProjectGoal(projectId: Uuid, goalId: Uuid, relation?: string): Promise<void>;
  linkProjectPerson(projectId: Uuid, personId: Uuid, role?: string | null): Promise<void>;
}

export type TaskStatusFilter = 'open' | 'in_progress' | 'blocked' | 'done' | 'dropped' | 'unfinished';
