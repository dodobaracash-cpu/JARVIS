'use client';

import { useEffect, useRef, useState } from 'react';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  memo?: string;
  pendingMemo?: boolean;
}

interface WrittenRecord {
  kind: string;
  action: string;
  summary: string;
}

const STORAGE_KEY = 'jarvis.conversationId';

export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    setConversationId(stored);
    fetch(`/api/chat?conversationId=${stored}`)
      .then((r) => r.json())
      .then((data: { messages?: Turn[] }) => {
        if (data.messages) setTurns(data.messages.map((m) => ({ role: m.role, content: m.content })));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setInput('');
    setBusy(true);
    setTurns((prev) => [...prev, { role: 'user', content: message }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, conversationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'request failed');

      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        window.localStorage.setItem(STORAGE_KEY, data.conversationId);
      }

      const counts = data.retrieved?.counts ?? {};
      const retrievedTotal = Object.values(counts).reduce<number>(
        (sum, value) => sum + (typeof value === 'number' ? value : 0),
        0,
      );

      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          memo: `retrieved ${retrievedTotal} records · intent ${data.retrieved?.intent ?? 'general'}`,
        },
      ]);

      // Memory writing is a second, separate pass over the same message.
      const index = turns.length + 1;
      setTurns((prev) =>
        prev.map((turn, i) => (i === index ? { ...turn, pendingMemo: true } : turn)),
      );

      const extractResponse = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId: data.messageId }),
      });
      const extraction = await extractResponse.json();
      const written: WrittenRecord[] = extraction.written ?? [];
      const memo =
        extraction.status === 'failed'
          ? `memory write failed: ${extraction.error} (replayable)`
          : written.length === 0
            ? 'nothing durable to remember'
            : `remembered: ${written.map((w) => `${w.kind} ${w.action} — ${w.summary}`).join(' · ')}`;

      setTurns((prev) =>
        prev.map((turn, i) =>
          i === index ? { ...turn, pendingMemo: false, memo: `${turn.memo} · ${memo}` } : turn,
        ),
      );
    } catch (error) {
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: `[error] ${(error as Error).message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function newConversation() {
    window.localStorage.removeItem(STORAGE_KEY);
    setConversationId(null);
    setTurns([]);
  }

  return (
    <main>
      <div className="meta" style={{ marginBottom: 16 }}>
        {conversationId ? (
          <>
            conversation {conversationId.slice(0, 8)} ·{' '}
            <button onClick={newConversation} style={{ padding: '2px 8px', fontSize: 12 }}>
              start fresh conversation
            </button>
          </>
        ) : (
          'new conversation'
        )}
      </div>

      {turns.length === 0 && (
        <p className="empty">
          Tell JARVIS what is happening. It answers from what it already knows, then decides
          separately what is worth remembering.
        </p>
      )}

      {turns.map((turn, i) => (
        <div key={i} className={`turn ${turn.role}`}>
          <div className="role">{turn.role === 'user' ? 'you' : 'jarvis'}</div>
          <div className="body">{turn.content}</div>
          {(turn.memo || turn.pendingMemo) && (
            <div className="memo">{turn.pendingMemo ? `${turn.memo} · writing memory…` : turn.memo}</div>
          )}
        </div>
      ))}
      <div ref={endRef} />

      <form className="composer" onSubmit={send}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What happened today?"
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? '…' : 'send'}
        </button>
      </form>
    </main>
  );
}
