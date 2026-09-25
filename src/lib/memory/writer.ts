import type { Candidate, CandidateKind } from '@/lib/memory/candidates';
import { jaccard, normalizeKey } from '@/lib/memory/text';
import { cosineSimilarity } from '@/lib/llm/similarity';
import type { EmbeddingProvider } from '@/lib/llm/types';
import type { Store } from '@/lib/store/store';
import type {
  Decision,
  MemoryRecord,
  ProfileFact,
  Project,
  RejectedCandidate,
  Uuid,
} from '@/lib/types';

/** Two memories this close in embedding space are the same memory restated. */
export const DUPLICATE_MEMORY_SIMILARITY = 0.9;
/** How close a `supersedes` hint must be to an existing record to replace it. */
export const SUPERSEDE_MATCH_SIMILARITY = 0.55;
/** Titles this similar are treated as the same task/decision/goal. */
export const TITLE_MATCH_SIMILARITY = 0.8;
/**
 * Facts are only ever compared inside one category, which already narrows the
 * field, so they match on less overlap than a free-text supersession hint.
 */
export const FACT_MATCH_SIMILARITY = 0.45;

export const MIN_CONFIDENCE = 0.3;
export const MIN_MEMORY_IMPORTANCE = 2;

export type WriteAction = 'created' | 'updated' | 'reconfirmed' | 'superseded';

export interface WrittenRecord {
  kind: CandidateKind;
  table: string;
  id: Uuid;
  action: WriteAction;
  summary: string;
  /** Set when this write retired an earlier record. */
  supersededId?: Uuid;
}

export interface WriteOutcome {
  written: WrittenRecord[];
  rejected: RejectedCandidate[];
}

export interface WriterDeps {
  store: Store;
  embedder: EmbeddingProvider;
}

export interface WriteParams {
  userId: Uuid;
  messageId: Uuid;
  candidates: Candidate[];
  now?: string;
}

/** Projects and people resolve first so later records can point at them. */
const KIND_ORDER: CandidateKind[] = [
  'project_update',
  'goal',
  'person',
  'decision',
  'task',
  'event',
  'profile_fact',
  'memory',
];

function summarize(candidate: Candidate): string {
  switch (candidate.kind) {
    case 'project_update':
    case 'person':
      return candidate.name;
    case 'task':
    case 'decision':
    case 'goal':
    case 'event':
      return candidate.title;
    case 'profile_fact':
    case 'memory':
      return candidate.content;
  }
}

/**
 * Turns validated candidates into persisted records: resolves entities, rejects
 * low-value items, detects duplicates and contradictions, supersedes what the
 * new information replaces, and writes what survives.
 */
export async function writeCandidates(
  deps: WriterDeps,
  params: WriteParams,
): Promise<WriteOutcome> {
  const { store, embedder } = deps;
  const { userId, messageId } = params;
  const now = params.now ?? new Date().toISOString();

  const written: WrittenRecord[] = [];
  const rejected: RejectedCandidate[] = [];

  const ordered = [...params.candidates].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );

  // One batched embedding call covers every memory body and supersession hint.
  const memoryCandidates = ordered.filter((c) => c.kind === 'memory');
  const embedTexts: string[] = [];
  for (const candidate of memoryCandidates) {
    embedTexts.push(candidate.content);
    if (candidate.supersedes) embedTexts.push(candidate.supersedes);
  }
  const vectors = embedTexts.length ? await embedder.embed(embedTexts) : [];
  const vectorFor = new Map<string, number[]>();
  embedTexts.forEach((text, i) => vectorFor.set(text, vectors[i]));

  const projectCache = new Map<string, Project | null>();

  async function resolveProject(name?: string): Promise<Project | null> {
    if (!name) return null;
    const key = normalizeKey(name);
    if (projectCache.has(key)) return projectCache.get(key) ?? null;

    let project = await store.findProjectByName(userId, name);
    if (!project) {
      const all = await store.listProjects(userId);
      project =
        all.find((p) => jaccard(p.name, name) >= TITLE_MATCH_SIMILARITY) ?? null;
    }
    if (!project) {
      // A named project JARVIS has never seen is worth a stub record: it keeps
      // tasks, decisions and events attached to something addressable.
      project = await store.createProject({
        user_id: userId,
        name: name.trim(),
        description: null,
        status: 'active',
        priority: 3,
        current_objective: null,
        current_milestone: null,
        current_state: null,
        last_activity_at: now,
      });
      written.push({
        kind: 'project_update',
        table: 'projects',
        id: project.id,
        action: 'created',
        summary: project.name,
      });
    }
    projectCache.set(key, project);
    return project;
  }

  for (const candidate of ordered) {
    try {
      if (candidate.confidence < MIN_CONFIDENCE) {
        rejected.push({
          kind: candidate.kind,
          summary: summarize(candidate),
          reason: `confidence ${candidate.confidence} below ${MIN_CONFIDENCE}`,
        });
        continue;
      }

      switch (candidate.kind) {
        case 'project_update': {
          const existing =
            (await store.findProjectByName(userId, candidate.name)) ??
            (await store.listProjects(userId)).find(
              (p) => jaccard(p.name, candidate.name) >= TITLE_MATCH_SIMILARITY,
            ) ??
            null;

          if (!existing) {
            const project = await store.createProject({
              user_id: userId,
              name: candidate.name.trim(),
              description: candidate.description ?? null,
              status: candidate.status ?? 'active',
              priority: candidate.priority ?? 3,
              current_objective: candidate.current_objective ?? null,
              current_milestone: candidate.current_milestone ?? null,
              current_state: candidate.current_state ?? null,
              last_activity_at: now,
            });
            projectCache.set(normalizeKey(project.name), project);
            written.push({
              kind: 'project_update',
              table: 'projects',
              id: project.id,
              action: 'created',
              summary: project.name,
            });
            break;
          }

          const patch: Partial<Project> = {};
          if (candidate.description && candidate.description !== existing.description) {
            patch.description = candidate.description;
          }
          if (candidate.status && candidate.status !== existing.status) patch.status = candidate.status;
          if (candidate.current_objective && candidate.current_objective !== existing.current_objective) {
            patch.current_objective = candidate.current_objective;
          }
          if (candidate.current_milestone && candidate.current_milestone !== existing.current_milestone) {
            patch.current_milestone = candidate.current_milestone;
          }
          if (candidate.current_state && candidate.current_state !== existing.current_state) {
            patch.current_state = candidate.current_state;
          }
          if (candidate.priority != null && candidate.priority !== existing.priority) {
            patch.priority = candidate.priority;
          }
          const changed = Object.keys(patch).length > 0;
          const project = await store.updateProject(existing.id, { ...patch, last_activity_at: now });
          projectCache.set(normalizeKey(project.name), project);
          written.push({
            kind: 'project_update',
            table: 'projects',
            id: project.id,
            action: changed ? 'updated' : 'reconfirmed',
            summary: project.name,
          });
          break;
        }

        case 'goal': {
          const goals = await store.listGoals(userId);
          const existing =
            goals.find((g) => normalizeKey(g.title) === normalizeKey(candidate.title)) ??
            goals.find((g) => jaccard(g.title, candidate.title) >= TITLE_MATCH_SIMILARITY);

          if (existing) {
            const patch: Partial<typeof existing> = {};
            if (candidate.description && candidate.description !== existing.description) {
              patch.description = candidate.description;
            }
            if (candidate.status && candidate.status !== existing.status) patch.status = candidate.status;
            if (candidate.priority && candidate.priority !== existing.priority) {
              patch.priority = candidate.priority;
            }
            const changed = Object.keys(patch).length > 0;
            const goal = await store.updateGoal(existing.id, patch);
            written.push({
              kind: 'goal',
              table: 'goals',
              id: goal.id,
              action: changed ? 'updated' : 'reconfirmed',
              summary: goal.title,
            });
          } else {
            const goal = await store.createGoal({
              user_id: userId,
              title: candidate.title.trim(),
              description: candidate.description ?? null,
              time_horizon: candidate.time_horizon ?? 'medium',
              status: candidate.status ?? 'active',
              priority: candidate.priority ?? 3,
              target_date: candidate.target_date ?? null,
            });
            written.push({
              kind: 'goal',
              table: 'goals',
              id: goal.id,
              action: 'created',
              summary: goal.title,
            });
            const project = await resolveProject(candidate.project);
            if (project) await store.linkProjectGoal(project.id, goal.id);
          }
          break;
        }

        case 'person': {
          const existing = await store.findPersonByName(userId, candidate.name);
          if (existing) {
            const patch: Partial<typeof existing> = {};
            if (candidate.relationship && candidate.relationship !== existing.relationship) {
              patch.relationship = candidate.relationship;
            }
            if (candidate.context && candidate.context !== existing.context) {
              patch.context = candidate.context;
            }
            const changed = Object.keys(patch).length > 0;
            const person = await store.updatePerson(existing.id, patch);
            written.push({
              kind: 'person',
              table: 'people',
              id: person.id,
              action: changed ? 'updated' : 'reconfirmed',
              summary: person.name,
            });
          } else {
            const person = await store.createPerson({
              user_id: userId,
              name: candidate.name.trim(),
              relationship: candidate.relationship ?? null,
              context: candidate.context ?? null,
              importance: candidate.importance,
            });
            written.push({
              kind: 'person',
              table: 'people',
              id: person.id,
              action: 'created',
              summary: person.name,
            });
            const project = await resolveProject(candidate.project);
            if (project) await store.linkProjectPerson(project.id, person.id);
          }
          break;
        }

        case 'decision': {
          const project = await resolveProject(candidate.project);
          const active = await store.listDecisions(userId, { status: 'active' });

          // An explicit supersedes hint wins; otherwise a decision with the same
          // title but different content is a reversal of that decision.
          let target: Decision | null = null;
          if (candidate.supersedes) {
            const hint = candidate.supersedes;
            const scored = active
              .map((d) => ({ d, score: Math.max(jaccard(d.title, hint), jaccard(d.decision, hint)) }))
              .sort((a, b) => b.score - a.score)[0];
            if (scored && scored.score >= SUPERSEDE_MATCH_SIMILARITY) target = scored.d;
          }
          const sameTitle =
            active.find((d) => normalizeKey(d.title) === normalizeKey(candidate.title)) ??
            active.find((d) => jaccard(d.title, candidate.title) >= TITLE_MATCH_SIMILARITY) ??
            null;

          if (!target && sameTitle) {
            if (jaccard(sameTitle.decision, candidate.decision) >= DUPLICATE_MEMORY_SIMILARITY) {
              written.push({
                kind: 'decision',
                table: 'decisions',
                id: sameTitle.id,
                action: 'reconfirmed',
                summary: sameTitle.title,
              });
              break;
            }
            target = sameTitle;
          }

          const created = await store.createDecision({
            user_id: userId,
            project_id: project?.id ?? null,
            title: candidate.title.trim(),
            decision: candidate.decision.trim(),
            reasoning: candidate.reasoning ?? null,
            alternatives: candidate.alternatives ?? null,
            status: 'active',
            superseded_by: null,
            made_at: now,
            source_type: 'conversation',
            source_id: messageId,
          });

          if (target) {
            // The old decision is kept, marked superseded, and pointed at the new
            // one — that chain is what answers "what did I change my mind about".
            await store.updateDecision(target.id, {
              status: 'superseded',
              superseded_by: created.id,
            });
          }

          written.push({
            kind: 'decision',
            table: 'decisions',
            id: created.id,
            action: target ? 'superseded' : 'created',
            summary: created.title,
            supersededId: target?.id,
          });
          break;
        }

        case 'task': {
          const project = await resolveProject(candidate.project);
          const tasks = await store.listTasks(userId, { limit: 200 });
          const existing =
            tasks.find((t) => normalizeKey(t.title) === normalizeKey(candidate.title)) ??
            tasks.find((t) => jaccard(t.title, candidate.title) >= TITLE_MATCH_SIMILARITY);

          if (existing) {
            const patch: Partial<typeof existing> = {};
            if (candidate.status && candidate.status !== existing.status) {
              patch.status = candidate.status;
              if (candidate.status === 'done') patch.completed_at = now;
            }
            if (candidate.reason && !existing.reason) patch.reason = candidate.reason;
            if (candidate.deadline && candidate.deadline !== existing.deadline) {
              patch.deadline = candidate.deadline;
            }
            if (project && existing.project_id == null) patch.project_id = project.id;
            const changed = Object.keys(patch).length > 0;
            const task = await store.updateTask(existing.id, patch);
            written.push({
              kind: 'task',
              table: 'tasks',
              id: task.id,
              action: changed ? 'updated' : 'reconfirmed',
              summary: task.title,
            });
            break;
          }

          const task = await store.createTask({
            user_id: userId,
            project_id: project?.id ?? null,
            title: candidate.title.trim(),
            description: candidate.description ?? null,
            reason: candidate.reason ?? null,
            status: candidate.status ?? 'open',
            priority: candidate.priority ?? 3,
            deadline: candidate.deadline ?? null,
            estimated_minutes: candidate.estimated_minutes ?? null,
            source_type: 'conversation',
            source_id: messageId,
            completed_at: candidate.status === 'done' ? now : null,
          });
          written.push({
            kind: 'task',
            table: 'tasks',
            id: task.id,
            action: 'created',
            summary: task.title,
          });
          break;
        }

        case 'event': {
          const project = await resolveProject(candidate.project);
          // Re-running extraction on the same message must not double the timeline.
          const recent = await store.listEvents(userId, { limit: 50 });
          const duplicate = recent.find(
            (e) =>
              e.source_id === messageId &&
              e.event_type === candidate.event_type &&
              normalizeKey(e.title) === normalizeKey(candidate.title),
          );
          if (duplicate) {
            written.push({
              kind: 'event',
              table: 'events',
              id: duplicate.id,
              action: 'reconfirmed',
              summary: duplicate.title,
            });
            break;
          }
          const event = await store.createEvent({
            user_id: userId,
            project_id: project?.id ?? null,
            event_type: candidate.event_type,
            title: candidate.title.trim(),
            description: candidate.description ?? null,
            occurred_at: candidate.occurred_at ?? now,
            source_type: 'conversation',
            source_id: messageId,
          });
          if (project) await store.updateProject(project.id, { last_activity_at: now });
          written.push({
            kind: 'event',
            table: 'events',
            id: event.id,
            action: 'created',
            summary: event.title,
          });
          break;
        }

        case 'profile_fact': {
          const facts = await store.listProfileFacts(userId, { status: 'active', limit: 200 });
          const sameCategory = facts.filter((f) => f.category === candidate.category);
          const scored = sameCategory
            .map((f) => ({ f, score: jaccard(f.content, candidate.content) }))
            .sort((a, b) => b.score - a.score)[0];

          const match: ProfileFact | undefined =
            scored && scored.score >= FACT_MATCH_SIMILARITY ? scored.f : undefined;

          if (match) {
            const identical = normalizeKey(match.content) === normalizeKey(candidate.content);
            if (identical) {
              // Hearing it again is confirmation, not a second fact.
              await store.updateProfileFact(match.id, {
                last_confirmed_at: now,
                confidence: Math.max(match.confidence, candidate.confidence),
                source_type:
                  match.source_type === 'inferred' && candidate.source_type === 'explicit'
                    ? 'explicit'
                    : match.source_type,
              });
              written.push({
                kind: 'profile_fact',
                table: 'profile_facts',
                id: match.id,
                action: 'reconfirmed',
                summary: match.content,
              });
              break;
            }
            if (match.source_type === 'explicit' && candidate.source_type === 'inferred') {
              rejected.push({
                kind: 'profile_fact',
                summary: candidate.content,
                reason: 'an inference may not supersede an explicitly stated fact',
              });
              break;
            }
          }

          const fact = await store.createProfileFact({
            user_id: userId,
            category: candidate.category,
            content: candidate.content.trim(),
            confidence: candidate.confidence,
            source_type: candidate.source_type,
            source_id: messageId,
            importance: candidate.importance,
            status: 'active',
            superseded_by: null,
            embedding: null,
            last_confirmed_at: now,
          });
          if (match) {
            await store.updateProfileFact(match.id, { status: 'superseded', superseded_by: fact.id });
          }
          written.push({
            kind: 'profile_fact',
            table: 'profile_facts',
            id: fact.id,
            action: match ? 'superseded' : 'created',
            summary: fact.content,
            supersededId: match?.id,
          });
          break;
        }

        case 'memory': {
          if (candidate.importance < MIN_MEMORY_IMPORTANCE) {
            rejected.push({
              kind: 'memory',
              summary: candidate.content,
              reason: `importance ${candidate.importance} below ${MIN_MEMORY_IMPORTANCE}`,
            });
            break;
          }

          const project = await resolveProject(candidate.project);
          const embedding = vectorFor.get(candidate.content)!;
          const activeMemories = await store.listMemories(userId, { status: 'active', limit: 500 });

          const scored = activeMemories
            .filter((m) => m.embedding)
            .map((m) => ({ m, score: cosineSimilarity(embedding, m.embedding!) }))
            .sort((a, b) => b.score - a.score);

          const nearDuplicate = scored[0]?.score >= DUPLICATE_MEMORY_SIMILARITY ? scored[0].m : null;
          if (nearDuplicate) {
            await store.updateMemory(nearDuplicate.id, {
              confidence: Math.max(nearDuplicate.confidence, candidate.confidence),
              importance: Math.max(nearDuplicate.importance, candidate.importance),
              source_type:
                nearDuplicate.source_type === 'inferred' && candidate.source_type === 'explicit'
                  ? 'explicit'
                  : nearDuplicate.source_type,
            });
            written.push({
              kind: 'memory',
              table: 'memories',
              id: nearDuplicate.id,
              action: 'reconfirmed',
              summary: nearDuplicate.content,
            });
            break;
          }

          // Supersession is driven by the model's explicit hint rather than by
          // similarity alone: two related memories are not a contradiction.
          let target: MemoryRecord | null = null;
          if (candidate.supersedes) {
            const hintVector = vectorFor.get(candidate.supersedes)!;
            const hintScored = activeMemories
              .filter((m) => m.embedding)
              .map((m) => ({
                m,
                score: Math.max(
                  cosineSimilarity(hintVector, m.embedding!),
                  jaccard(candidate.supersedes!, m.content),
                ),
              }))
              .sort((a, b) => b.score - a.score)[0];
            if (hintScored && hintScored.score >= SUPERSEDE_MATCH_SIMILARITY) target = hintScored.m;
          }

          const memory = await store.createMemory({
            user_id: userId,
            project_id: project?.id ?? null,
            content: candidate.content.trim(),
            memory_type: candidate.memory_type,
            importance: candidate.importance,
            confidence: candidate.confidence,
            source_type: candidate.source_type,
            source_id: messageId,
            status: 'active',
            superseded_by: null,
            embedding,
            last_accessed_at: null,
          });

          if (target) {
            await store.updateMemory(target.id, { status: 'superseded', superseded_by: memory.id });
          }
          if (project) await store.linkMemoryEntity(memory.id, 'project', project.id);

          written.push({
            kind: 'memory',
            table: 'memories',
            id: memory.id,
            action: target ? 'superseded' : 'created',
            summary: memory.content,
            supersededId: target?.id,
          });
          break;
        }
      }
    } catch (error) {
      rejected.push({
        kind: candidate.kind,
        summary: summarize(candidate),
        reason: `write failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { written, rejected };
}
