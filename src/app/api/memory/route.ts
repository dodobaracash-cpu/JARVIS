import { NextResponse } from 'next/server';
import { getCurrentUser, getDeps } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const deps = getDeps();
  const user = await getCurrentUser(deps.store);
  const store = deps.store;

  const [projects, tasks, activeDecisions, supersededDecisions, events, facts, memories, goals, people, runs] =
    await Promise.all([
      store.listProjects(user.id, { limit: 50 }),
      store.listTasks(user.id, { limit: 100 }),
      store.listDecisions(user.id, { status: 'active', limit: 50 }),
      store.listDecisions(user.id, { status: 'superseded', limit: 50 }),
      store.listEvents(user.id, { limit: 50 }),
      store.listProfileFacts(user.id, { limit: 100 }),
      store.listMemories(user.id, { limit: 200 }),
      store.listGoals(user.id, { limit: 50 }),
      store.listPeople(user.id, 50),
      store.listExtractionRuns(user.id, { limit: 25 }),
    ]);

  return NextResponse.json({
    user,
    projects,
    tasks,
    decisions: [...activeDecisions, ...supersededDecisions],
    events,
    profileFacts: facts,
    // Embeddings are large and useless to the UI.
    memories: memories.map(({ embedding, ...rest }) => rest),
    goals,
    people,
    extractionRuns: runs,
  });
}

/** Correction surface: the user can retire or reword anything JARVIS believes. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      table?: string;
      id?: string;
      status?: string;
      content?: string;
    };
    if (!body.table || !body.id) {
      return NextResponse.json({ error: 'table and id are required' }, { status: 400 });
    }

    const deps = getDeps();
    await getCurrentUser(deps.store);
    const store = deps.store;

    switch (body.table) {
      case 'memories': {
        const patch: Record<string, unknown> = {};
        if (body.status) patch.status = body.status;
        if (body.content) patch.content = body.content;
        const updated = await store.updateMemory(body.id, patch);
        return NextResponse.json({ record: { ...updated, embedding: undefined } });
      }
      case 'profile_facts': {
        const patch: Record<string, unknown> = {};
        if (body.status) patch.status = body.status;
        if (body.content) patch.content = body.content;
        const updated = await store.updateProfileFact(body.id, patch);
        return NextResponse.json({ record: { ...updated, embedding: undefined } });
      }
      case 'decisions': {
        if (!body.status) return NextResponse.json({ error: 'status is required' }, { status: 400 });
        const updated = await store.updateDecision(body.id, { status: body.status as never });
        return NextResponse.json({ record: updated });
      }
      case 'tasks': {
        if (!body.status) return NextResponse.json({ error: 'status is required' }, { status: 400 });
        const updated = await store.updateTask(body.id, { status: body.status as never });
        return NextResponse.json({ record: updated });
      }
      default:
        return NextResponse.json({ error: `table ${body.table} is not correctable` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'update failed' },
      { status: 500 },
    );
  }
}
