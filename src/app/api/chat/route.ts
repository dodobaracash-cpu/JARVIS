import { NextResponse } from 'next/server';
import { respond } from '@/lib/jarvis';
import { getCurrentUser, getDeps, getOrCreateConversation } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string; conversationId?: string };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const deps = getDeps();
    const user = await getCurrentUser(deps.store);
    const conversation = await getOrCreateConversation(deps.store, user.id, body.conversationId);

    const result = await respond(deps, {
      userId: user.id,
      conversationId: conversation.id,
      message,
    });

    // The reply returns now; the client fires /api/extract with this messageId
    // so writing to long-term memory never sits in front of the answer.
    return NextResponse.json({
      conversationId: conversation.id,
      messageId: result.userMessage.id,
      reply: result.reply,
      retrieved: {
        intent: result.context.classification.intent,
        project: result.context.focusProject?.name ?? null,
        counts: {
          projects: result.context.projects.length,
          tasks: result.context.tasks.length,
          decisions: result.context.decisions.length,
          events: result.context.events.length,
          memories: result.context.memories.length,
          profileFacts: result.context.profileFacts.length,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'chat failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const deps = getDeps();
    const user = await getCurrentUser(deps.store);

    if (!conversationId) {
      const conversations = await deps.store.listConversations(user.id, 20);
      return NextResponse.json({ conversations });
    }
    const messages = await deps.store.listMessages(conversationId, 100);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'lookup failed' },
      { status: 500 },
    );
  }
}
