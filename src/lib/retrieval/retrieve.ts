import { classifyQuery, type QueryClassification } from '@/lib/retrieval/intent';
import type { EmbeddingProvider } from '@/lib/llm/types';
import type { Store } from '@/lib/store/store';
import type {
  Decision,
  Goal,
  LifeEvent,
  Person,
  ProfileFact,
  Project,
  ScoredMemory,
  Task,
  Uuid,
} from '@/lib/types';

/**
 * Per-section caps. The model gets a small package, never the whole database:
 * these numbers are the token budget and the precision guard at once.
 */
export const LIMITS = {
  profileFacts: 5,
  projects: 4,
  tasks: 8,
  decisions: 5,
  events: 8,
  memories: 6,
  goals: 4,
  people: 3,
} as const;

/** Vector hits below this are noise and are dropped rather than padded in. */
export const MIN_SIMILARITY = 0.12;

export interface ContextPackage {
  query: string;
  classification: QueryClassification;
  focusProject: Project | null;
  projects: Project[];
  tasks: Task[];
  decisions: Decision[];
  supersededDecisions: Decision[];
  events: LifeEvent[];
  memories: ScoredMemory[];
  profileFacts: ProfileFact[];
  goals: Goal[];
  people: Person[];
}

export interface RetrieveDeps {
  store: Store;
  embedder: EmbeddingProvider;
}

function recencyScore(timestamp: string, now: number): number {
  const ageDays = Math.max(0, (now - Date.parse(timestamp)) / 86_400_000);
  return Math.exp(-ageDays / 30);
}

/**
 * Hybrid retrieval: deterministic structured queries for the entities the query
 * names, vector similarity for everything semantic, then one ranking pass that
 * weighs similarity against importance, confidence and recency.
 */
export async function retrieveContext(
  deps: RetrieveDeps,
  params: { userId: Uuid; query: string; now?: string },
): Promise<ContextPackage> {
  const { store, embedder } = deps;
  const nowIso = params.now ?? new Date().toISOString();
  const now = Date.parse(nowIso);

  const [allProjects, people] = await Promise.all([
    store.listProjects(params.userId, { limit: 50 }),
    store.listPeople(params.userId, 50),
  ]);

  const classification = classifyQuery(params.query, { projects: allProjects, people });
  const focusProject = classification.projectId
    ? allProjects.find((p) => p.id === classification.projectId) ?? null
    : null;

  const [queryEmbedding] = await embedder.embed([params.query]);

  const [
    activeProjects,
    tasks,
    activeDecisions,
    events,
    profileFacts,
    goals,
    semanticMemories,
  ] = await Promise.all([
    store.listProjects(params.userId, { status: 'active', limit: LIMITS.projects }),
    store.listTasks(params.userId, {
      status: 'unfinished',
      ...(focusProject ? { projectId: focusProject.id } : {}),
      limit: LIMITS.tasks,
    }),
    store.listDecisions(params.userId, {
      status: 'active',
      ...(focusProject ? { projectId: focusProject.id } : {}),
      limit: LIMITS.decisions,
    }),
    store.listEvents(params.userId, {
      ...(focusProject ? { projectId: focusProject.id } : {}),
      limit: LIMITS.events,
    }),
    store.listProfileFacts(params.userId, { status: 'active', limit: 25 }),
    store.listGoals(params.userId, { status: 'active', limit: LIMITS.goals }),
    store.searchMemories(params.userId, queryEmbedding, {
      limit: LIMITS.memories * 3,
      minImportance: 2,
    }),
  ]);

  const memories = semanticMemories
    .filter((m) => m.similarity >= MIN_SIMILARITY)
    .map((m) => ({
      memory: m,
      score:
        0.55 * m.similarity +
        0.2 * (m.importance / 5) +
        0.15 * m.confidence +
        0.1 * recencyScore(m.created_at, now),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMITS.memories)
    .map((entry) => entry.memory);

  // "What did I change my mind about" is the one question that needs the
  // retired records; every other path sees active records only.
  const supersededDecisions =
    classification.intent === 'changed_decisions'
      ? await store.listDecisions(params.userId, { status: 'superseded', limit: LIMITS.decisions })
      : [];

  const projects = focusProject
    ? [focusProject, ...activeProjects.filter((p) => p.id !== focusProject.id)].slice(0, LIMITS.projects)
    : activeProjects;

  const relevantPeople = classification.personId
    ? people.filter((p) => p.id === classification.personId)
    : people
        .slice()
        .sort((a, b) => b.importance - a.importance)
        .slice(0, classification.intent === 'general' ? 0 : LIMITS.people);

  return {
    query: params.query,
    classification,
    focusProject,
    projects,
    tasks,
    decisions: activeDecisions,
    supersededDecisions,
    events,
    memories,
    profileFacts: profileFacts.slice(0, LIMITS.profileFacts),
    goals,
    people: relevantPeople,
  };
}
