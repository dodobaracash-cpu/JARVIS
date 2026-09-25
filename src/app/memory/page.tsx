'use client';

import { useCallback, useEffect, useState } from 'react';

interface Snapshot {
  projects: any[];
  tasks: any[];
  decisions: any[];
  events: any[];
  profileFacts: any[];
  memories: any[];
  goals: any[];
  people: any[];
  extractionRuns: any[];
}

function Tag({ label, kind }: { label: string; kind?: string }) {
  return <span className={`tag${kind ? ` ${kind}` : ''}`}>{label}</span>;
}

function sourceTag(sourceType: string) {
  return <Tag label={sourceType} kind={sourceType === 'inferred' ? 'inferred' : 'explicit'} />;
}

function statusTag(status: string) {
  const retired = status === 'superseded' || status === 'rejected' || status === 'deleted';
  return retired ? <Tag label={status} kind="retired" /> : null;
}

export default function MemoryPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/memory')
      .then((r) => r.json())
      .then((json) => (json.error ? setError(json.error) : setData(json)))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(load, [load]);

  async function correct(table: string, id: string, status: string) {
    await fetch('/api/memory', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ table, id, status }),
    });
    load();
  }

  if (error) return <p className="empty">Could not load memory: {error}</p>;
  if (!data) return <p className="empty">Loading…</p>;

  return (
    <main>
      <p className="meta">
        Everything JARVIS believes, with where it came from. Superseded records stay visible as
        history and are never used as current truth.
      </p>

      <section className="block">
        <h2>Profile facts</h2>
        {data.profileFacts.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.profileFacts.map((fact) => (
          <div className="record" key={fact.id}>
            <div className="main">
              <div>{fact.content}</div>
              <div className="meta">
                {fact.category} · confidence {Number(fact.confidence).toFixed(2)} ·{' '}
                {fact.created_at.slice(0, 10)}
              </div>
            </div>
            {sourceTag(fact.source_type)}
            {statusTag(fact.status)}
            {fact.status === 'active' && (
              <button
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => correct('profile_facts', fact.id, 'rejected')}
              >
                that&apos;s wrong
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="block">
        <h2>Projects</h2>
        {data.projects.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.projects.map((project) => (
          <div className="record" key={project.id}>
            <div className="main">
              <div>{project.name}</div>
              <div className="meta">
                {project.current_objective ?? 'no objective set'}
                {project.current_milestone ? ` · milestone: ${project.current_milestone}` : ''}
                {project.current_state ? ` · ${project.current_state}` : ''}
              </div>
            </div>
            <Tag label={project.status} kind={project.status === 'graveyard' ? 'retired' : undefined} />
          </div>
        ))}
      </section>

      <section className="block">
        <h2>Goals</h2>
        {data.goals.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.goals.map((goal) => (
          <div className="record" key={goal.id}>
            <div className="main">
              <div>{goal.title}</div>
              <div className="meta">
                {goal.time_horizon} · priority {goal.priority}
                {goal.description ? ` · ${goal.description}` : ''}
              </div>
            </div>
            <Tag label={goal.status} />
          </div>
        ))}
      </section>

      <section className="block">
        <h2>Tasks</h2>
        {data.tasks.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.tasks.map((task) => (
          <div className="record" key={task.id}>
            <div className="main">
              <div>{task.title}</div>
              <div className="meta">
                {task.reason ? `why: ${task.reason} · ` : ''}p{task.priority}
                {task.deadline ? ` · due ${task.deadline.slice(0, 10)}` : ''}
              </div>
            </div>
            <Tag label={task.status} />
            {task.status !== 'done' && task.status !== 'dropped' && (
              <button
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => correct('tasks', task.id, 'done')}
              >
                done
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="block">
        <h2>Decisions</h2>
        {data.decisions.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.decisions.map((decision) => (
          <div className="record" key={decision.id}>
            <div className="main">
              <div>
                {decision.title}: {decision.decision}
              </div>
              <div className="meta">
                {decision.reasoning ? `${decision.reasoning} · ` : ''}
                {decision.made_at.slice(0, 10)}
                {decision.superseded_by ? ' · replaced by a later decision' : ''}
              </div>
            </div>
            <Tag label={decision.status} kind={decision.status !== 'active' ? 'retired' : undefined} />
          </div>
        ))}
      </section>

      <section className="block">
        <h2>Memories</h2>
        {data.memories.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.memories.map((memory) => (
          <div className="record" key={memory.id}>
            <div className="main">
              <div>{memory.content}</div>
              <div className="meta">
                {memory.memory_type} · importance {memory.importance} · confidence{' '}
                {Number(memory.confidence).toFixed(2)} · {memory.created_at.slice(0, 10)}
              </div>
            </div>
            {sourceTag(memory.source_type)}
            {statusTag(memory.status)}
            {memory.status === 'active' && (
              <button
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => correct('memories', memory.id, 'deleted')}
              >
                that&apos;s wrong
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="block">
        <h2>People</h2>
        {data.people.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.people.map((person) => (
          <div className="record" key={person.id}>
            <div className="main">
              <div>{person.name}</div>
              <div className="meta">
                {person.relationship ?? 'relationship unknown'}
                {person.context ? ` · ${person.context}` : ''}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="block">
        <h2>Timeline</h2>
        {data.events.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.events.map((event) => (
          <div className="record" key={event.id}>
            <div className="main">
              <div>{event.title}</div>
              <div className="meta">
                {event.occurred_at.slice(0, 10)} · {event.event_type}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="block">
        <h2>Extraction runs</h2>
        {data.extractionRuns.length === 0 && <p className="empty">Nothing yet.</p>}
        {data.extractionRuns.map((run) => (
          <div className="record" key={run.id}>
            <div className="main">
              <div>
                {run.status} · {run.written_count}/{run.candidate_count} written
              </div>
              <div className="meta">
                {run.created_at.slice(0, 16).replace('T', ' ')}
                {run.error ? ` · ${run.error}` : ''}
                {Array.isArray(run.rejected) && run.rejected.length > 0
                  ? ` · rejected: ${run.rejected.map((r: any) => r.reason).join('; ')}`
                  : ''}
              </div>
            </div>
            <Tag label={run.status} kind={run.status === 'failed' ? 'retired' : undefined} />
          </div>
        ))}
        {data.extractionRuns.some((run) => run.status === 'failed') && (
          <button
            style={{ marginTop: 12 }}
            onClick={async () => {
              await fetch('/api/extract', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ replayFailed: true }),
              });
              load();
            }}
          >
            replay failed extractions
          </button>
        )}
      </section>
    </main>
  );
}
