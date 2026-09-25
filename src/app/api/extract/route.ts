import { NextResponse } from 'next/server';
import { replayFailedExtractions, runExtractionForMessage } from '@/lib/memory/pipeline';
import { getCurrentUser, getDeps } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messageId?: string; replayFailed?: boolean };
    const deps = getDeps();
    const user = await getCurrentUser(deps.store);

    if (body.replayFailed) {
      const results = await replayFailedExtractions(deps, user.id);
      return NextResponse.json({
        replayed: results.length,
        succeeded: results.filter((r) => r.run.status === 'succeeded').length,
      });
    }

    if (!body.messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    const { run, outcome } = await runExtractionForMessage(deps, {
      userId: user.id,
      messageId: body.messageId,
    });

    return NextResponse.json({
      status: run.status,
      error: run.error,
      written: outcome?.written ?? [],
      rejected: outcome?.rejected ?? run.rejected ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'extraction failed' },
      { status: 500 },
    );
  }
}
