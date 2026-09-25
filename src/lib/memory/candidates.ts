import { z } from 'zod';

const importance = z.number().int().min(1).max(5).default(3);
const confidence = z.number().min(0).max(1).default(0.8);
/**
 * The model may only ever claim `explicit` or `inferred`. Everything else is
 * set by the system, so a model cannot promote its own guess to a stated fact.
 */
const sourceType = z.enum(['explicit', 'inferred']).default('explicit');

const base = { importance, confidence, source_type: sourceType };

export const projectUpdateCandidate = z.object({
  kind: z.literal('project_update'),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'validation', 'completed', 'graveyard']).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  current_objective: z.string().optional(),
  current_milestone: z.string().optional(),
  current_state: z.string().optional(),
  ...base,
});

export const taskCandidate = z.object({
  kind: z.literal('task'),
  title: z.string().min(1),
  description: z.string().optional(),
  reason: z.string().optional(),
  project: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'blocked', 'done', 'dropped']).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  deadline: z.string().optional(),
  estimated_minutes: z.number().int().positive().optional(),
  ...base,
});

export const decisionCandidate = z.object({
  kind: z.literal('decision'),
  title: z.string().min(1),
  decision: z.string().min(1),
  reasoning: z.string().optional(),
  alternatives: z.string().optional(),
  project: z.string().optional(),
  /** Title of an earlier decision this one replaces, if the user reversed course. */
  supersedes: z.string().optional(),
  ...base,
});

export const eventCandidate = z.object({
  kind: z.literal('event'),
  event_type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  project: z.string().optional(),
  occurred_at: z.string().optional(),
  ...base,
});

export const profileFactCandidate = z.object({
  kind: z.literal('profile_fact'),
  category: z.string().min(1),
  content: z.string().min(1),
  ...base,
});

export const goalCandidate = z.object({
  kind: z.literal('goal'),
  title: z.string().min(1),
  description: z.string().optional(),
  time_horizon: z.enum(['short', 'medium', 'long', 'life']).optional(),
  status: z.enum(['active', 'paused', 'achieved', 'abandoned']).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  target_date: z.string().optional(),
  project: z.string().optional(),
  ...base,
});

export const personCandidate = z.object({
  kind: z.literal('person'),
  name: z.string().min(1),
  relationship: z.string().optional(),
  context: z.string().optional(),
  project: z.string().optional(),
  ...base,
});

export const memoryCandidate = z.object({
  kind: z.literal('memory'),
  content: z.string().min(1),
  memory_type: z
    .enum(['context', 'preference', 'insight', 'strategy', 'relationship', 'identity'])
    .default('context'),
  project: z.string().optional(),
  /** Free text describing what this replaces, e.g. "MarketMind is active". */
  supersedes: z.string().optional(),
  ...base,
});

export const candidateSchema = z.discriminatedUnion('kind', [
  projectUpdateCandidate,
  taskCandidate,
  decisionCandidate,
  eventCandidate,
  profileFactCandidate,
  goalCandidate,
  personCandidate,
  memoryCandidate,
]);

export const extractionResultSchema = z.object({
  candidates: z.array(candidateSchema).default([]),
  /** Things the model saw but deliberately did not persist, for observability. */
  discarded: z
    .array(z.object({ summary: z.string(), reason: z.string() }))
    .default([]),
});

export type Candidate = z.infer<typeof candidateSchema>;
export type CandidateKind = Candidate['kind'];
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

/**
 * JSON Schema handed to the provider. Kept flat (one object, optional fields,
 * tagged by `kind`) because nested oneOf schemas degrade tool-call reliability;
 * zod above is what actually enforces per-kind shape.
 */
export const extractionJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      description: 'Structured records worth persisting. Empty if the message holds nothing durable.',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'project_update',
              'task',
              'decision',
              'event',
              'profile_fact',
              'goal',
              'person',
              'memory',
            ],
          },
          name: { type: 'string', description: 'project_update / person: the entity name' },
          title: { type: 'string', description: 'task / decision / event / goal: short title' },
          content: { type: 'string', description: 'profile_fact / memory: the statement itself' },
          decision: { type: 'string', description: 'decision: what was decided' },
          reasoning: { type: 'string', description: 'decision: why' },
          alternatives: { type: 'string', description: 'decision: what else was considered' },
          supersedes: {
            type: 'string',
            description:
              'decision / memory: the earlier record this replaces, by title or plain description',
          },
          category: {
            type: 'string',
            description:
              'profile_fact: e.g. work_preference, communication_style, schedule, identity, health',
          },
          memory_type: {
            type: 'string',
            enum: ['context', 'preference', 'insight', 'strategy', 'relationship', 'identity'],
          },
          event_type: {
            type: 'string',
            description: 'event: e.g. worked_on_project, meeting, school, decision_made',
          },
          description: { type: 'string' },
          reason: { type: 'string', description: 'task: why this task matters' },
          project: { type: 'string', description: 'name of the related project, if any' },
          status: { type: 'string' },
          priority: { type: 'integer', minimum: 1, maximum: 5 },
          deadline: { type: 'string', description: 'ISO 8601 date or datetime' },
          estimated_minutes: { type: 'integer' },
          occurred_at: { type: 'string', description: 'ISO 8601 datetime' },
          time_horizon: { type: 'string', enum: ['short', 'medium', 'long', 'life'] },
          target_date: { type: 'string', description: 'ISO 8601 date' },
          relationship: { type: 'string', description: 'person: how they relate to the user' },
          current_objective: { type: 'string' },
          current_milestone: { type: 'string' },
          current_state: { type: 'string' },
          importance: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            description: '5 = shapes identity or major commitments, 1 = trivia',
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          source_type: {
            type: 'string',
            enum: ['explicit', 'inferred'],
            description: 'explicit if the user stated it; inferred if you deduced it',
          },
        },
        required: ['kind'],
      },
    },
    discarded: {
      type: 'array',
      description: 'Information you chose not to persist, and why.',
      items: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['summary', 'reason'],
      },
    },
  },
  required: ['candidates'],
};
