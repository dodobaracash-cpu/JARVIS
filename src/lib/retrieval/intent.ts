import { normalizeKey } from '@/lib/memory/text';
import type { Person, Project, Uuid } from '@/lib/types';

export type Intent =
  | 'project_status'
  | 'decision_lookup'
  | 'changed_decisions'
  | 'priorities'
  | 'recent_activity'
  | 'profile'
  | 'person'
  | 'general';

export interface QueryClassification {
  intent: Intent;
  projectId: Uuid | null;
  projectName: string | null;
  personId: Uuid | null;
}

const PATTERNS: { intent: Intent; test: RegExp }[] = [
  { intent: 'changed_decisions', test: /(changed my mind|reversed|used to (think|decide)|no longer)/i },
  { intent: 'decision_lookup', test: /(decide|decided|decision|did we agree|what was the call)/i },
  { intent: 'priorities', test: /(priorit|most important|focus on|what should i (work on|do))/i },
  { intent: 'recent_activity', test: /(recently|lately|been working on|last few days|this week|what have i)/i },
  { intent: 'project_status', test: /(where did i leave|status of|how is|where am i (with|on)|next on)/i },
  { intent: 'profile', test: /(know about me|my preferences|how do i (like|prefer)|who am i)/i },
];

/**
 * Deterministic query classification. Structured retrieval is driven by rules
 * rather than a model call so it stays fast, free and testable; the vector
 * search running alongside it covers what the rules miss.
 */
export function classifyQuery(
  query: string,
  entities: { projects: Project[]; people: Person[] },
): QueryClassification {
  const normalized = normalizeKey(query);

  const project =
    entities.projects.find((p) => normalized.includes(normalizeKey(p.name))) ?? null;
  const person = entities.people.find((p) => {
    const key = normalizeKey(p.name);
    return key.length > 2 && new RegExp(`\\b${key}\\b`).test(normalized);
  }) ?? null;

  let intent: Intent = 'general';
  for (const pattern of PATTERNS) {
    if (pattern.test.test(query)) {
      intent = pattern.intent;
      break;
    }
  }

  if (intent === 'general' && project) intent = 'project_status';
  if (intent === 'general' && person) intent = 'person';

  return {
    intent,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    personId: person?.id ?? null,
  };
}
