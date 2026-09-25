import type { ContextPackage } from '@/lib/retrieval/retrieve';

function day(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function provenance(record: {
  source_type: string;
  confidence?: number;
  created_at?: string;
  made_at?: string;
}): string {
  const parts = [record.source_type];
  if (typeof record.confidence === 'number') parts.push(`conf ${record.confidence.toFixed(2)}`);
  const date = record.made_at ?? record.created_at;
  if (date) parts.push(day(date));
  return `(${parts.join(', ')})`;
}

/**
 * Renders the retrieved package as the labelled text block the model sees.
 * Every line carries its type, provenance and date so JARVIS can tell the user
 * what it actually knows versus what it inferred.
 */
export function renderContext(pkg: ContextPackage, opts: { now?: string } = {}): string {
  const now = opts.now ?? new Date().toISOString();
  const sections: string[] = [];

  sections.push(`TODAY: ${day(now)}`);
  sections.push(`QUERY INTENT: ${pkg.classification.intent}`);

  if (pkg.focusProject) {
    const p = pkg.focusProject;
    const lines = [`FOCUS PROJECT: ${p.name} [${p.status}]`];
    if (p.current_objective) lines.push(`  Objective: ${p.current_objective}`);
    if (p.current_milestone) lines.push(`  Milestone: ${p.current_milestone}`);
    if (p.current_state) lines.push(`  State: ${p.current_state}`);
    lines.push(`  Last activity: ${day(p.last_activity_at)}`);
    sections.push(lines.join('\n'));
  }

  const otherProjects = pkg.projects.filter((p) => p.id !== pkg.focusProject?.id);
  if (otherProjects.length) {
    sections.push(
      ['ACTIVE PROJECTS']
        .concat(
          otherProjects.map(
            (p) =>
              `- ${p.name} [${p.status}]${p.current_milestone ? ` — ${p.current_milestone}` : ''}`,
          ),
        )
        .join('\n'),
    );
  }

  if (pkg.goals.length) {
    sections.push(
      ['GOALS']
        .concat(pkg.goals.map((g) => `- ${g.title} [${g.time_horizon}, priority ${g.priority}]`))
        .join('\n'),
    );
  }

  if (pkg.tasks.length) {
    sections.push(
      ['OPEN TASKS']
        .concat(
          pkg.tasks.map(
            (t) =>
              `- ${t.title} [${t.status}, p${t.priority}]${t.reason ? ` — why: ${t.reason}` : ''}${
                t.deadline ? ` — due ${day(t.deadline)}` : ''
              }`,
          ),
        )
        .join('\n'),
    );
  }

  if (pkg.decisions.length) {
    sections.push(
      ['ACTIVE DECISIONS']
        .concat(
          pkg.decisions.map(
            (d) =>
              `- ${d.title}: ${d.decision} ${provenance(d)}${d.reasoning ? ` — reasoning: ${d.reasoning}` : ''}`,
          ),
        )
        .join('\n'),
    );
  }

  if (pkg.supersededDecisions.length) {
    sections.push(
      ['SUPERSEDED DECISIONS (no longer current — the user changed their mind)']
        .concat(
          pkg.supersededDecisions.map((d) => `- ${d.title}: ${d.decision} ${provenance(d)}`),
        )
        .join('\n'),
    );
  }

  if (pkg.events.length) {
    sections.push(
      ['RECENT ACTIVITY']
        .concat(pkg.events.map((e) => `- ${day(e.occurred_at)} [${e.event_type}] ${e.title}`))
        .join('\n'),
    );
  }

  if (pkg.memories.length) {
    sections.push(
      ['RELEVANT MEMORIES']
        .concat(pkg.memories.map((m) => `- ${m.content} [${m.memory_type}] ${provenance(m)}`))
        .join('\n'),
    );
  }

  if (pkg.people.length) {
    sections.push(
      ['PEOPLE']
        .concat(
          pkg.people.map(
            (p) => `- ${p.name}${p.relationship ? ` (${p.relationship})` : ''}${p.context ? ` — ${p.context}` : ''}`,
          ),
        )
        .join('\n'),
    );
  }

  if (pkg.profileFacts.length) {
    sections.push(
      ['PROFILE']
        .concat(
          pkg.profileFacts.map((f) => `- [${f.category}] ${f.content} ${provenance(f)}`),
        )
        .join('\n'),
    );
  }

  if (sections.length <= 2) {
    sections.push('NO STORED CONTEXT MATCHED THIS QUERY.');
  }

  return sections.join('\n\n');
}
