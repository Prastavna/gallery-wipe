import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  countDeckItems,
  endSession,
  getDecision,
  getDeckItems,
  restoreDecision,
  setDecision,
  startSession,
  type Decision,
  type DecisionRecord,
  type DeckItem,
} from '@/db/decisions';

const PAGE_SIZE = 12;
const REFILL_BELOW = 6;
const UNDO_LIMIT = 50;

type HistoryEntry = {
  item: DeckItem;
  decision: Decision;
  // Resolves once the decision is written, with whatever it replaced.
  previous: Promise<DecisionRecord | null>;
};

export type DeckStatus = 'loading' | 'ready' | 'done';

const EMPTY_COUNTS: Record<Decision, number> = { keep: 0, trash: 0, skip: 0 };

/**
 * Drives one swipe session. Decisions are written to SQLite immediately (so a crash loses
 * nothing) through a serial write chain, which keeps decide → undo → refill in order.
 */
export function useDeck() {
  const db = useSQLiteContext();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [queue, setQueue] = useState<DeckItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [remaining, setRemaining] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  // The most recently undone item, so its card can fly back in from where it left.
  const [restored, setRestored] = useState<{ id: string; decision: Decision } | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const fetching = useRef(false);

  // Latest cards, for prune() which must stay stable across renders.
  const cards = useRef<{ queue: DeckItem[]; history: HistoryEntry[] }>({ queue: [], history: [] });
  useEffect(() => {
    cards.current = { queue, history };
  }, [queue, history]);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const result = writes.current.then(task);
    writes.current = result.catch((error) => console.warn('Deck write failed', error));
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let id: number | null = null;

    (async () => {
      id = await startSession(db, { preset: 'all' });
      const [total, items] = await Promise.all([
        countDeckItems(db, id),
        getDeckItems(db, id, [], PAGE_SIZE),
      ]);
      if (cancelled) return;
      setSessionId(id);
      setRemaining(total);
      setQueue(items);
      setExhausted(items.length < PAGE_SIZE);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      const sessionToEnd = id;
      if (sessionToEnd !== null) enqueue(() => endSession(db, sessionToEnd));
    };
  }, [db, enqueue]);

  useEffect(() => {
    if (sessionId === null || exhausted || fetching.current || queue.length >= REFILL_BELOW) return;
    fetching.current = true;
    const excludeIds = queue.map((item) => item.id);
    enqueue(() => getDeckItems(db, sessionId, excludeIds, PAGE_SIZE))
      .then((items) => {
        if (items.length < PAGE_SIZE) setExhausted(true);
        setQueue((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...items.filter((item) => !seen.has(item.id))];
        });
      })
      .finally(() => {
        fetching.current = false;
      });
  }, [db, enqueue, sessionId, exhausted, queue]);

  function decide(item: DeckItem, decision: Decision) {
    if (sessionId === null) return;
    setQueue((current) => current.filter((queued) => queued.id !== item.id));
    setCounts((current) => ({ ...current, [decision]: current[decision] + 1 }));
    setRemaining((current) => Math.max(0, current - 1));
    setRestored(null);

    const previous = enqueue(async () => {
      const before = await getDecision(db, item.id);
      await setDecision(db, item.id, { decision, decidedAt: Date.now(), sessionId });
      return before;
    });
    setHistory((current) => [...current.slice(-(UNDO_LIMIT - 1)), { item, decision, previous }]);
  }

  function undo() {
    const entry = history.at(-1);
    if (!entry) return;
    setHistory((current) => current.slice(0, -1));
    setQueue((current) => [entry.item, ...current.filter((queued) => queued.id !== entry.item.id)]);
    setCounts((current) => ({ ...current, [entry.decision]: current[entry.decision] - 1 }));
    setRemaining((current) => current + 1);
    setRestored({ id: entry.item.id, decision: entry.decision });
    enqueue(async () => restoreDecision(db, entry.item.id, await entry.previous));
  }

  // Drops cards whose asset no longer exists (e.g. just deleted from the Trash screen), so undo
  // never brings back a photo that is gone.
  const prune = useCallback(() => {
    const { queue: queued, history: done } = cards.current;
    const ids = [...queued.map((item) => item.id), ...done.map((entry) => entry.item.id)];
    if (ids.length === 0) return;
    enqueue(() =>
      db.getAllAsync<{ id: string }>(
        'SELECT id FROM assets WHERE id IN (SELECT value FROM json_each(?))',
        JSON.stringify(ids)
      )
    ).then((rows) => {
      const existing = new Set(rows.map((row) => row.id));
      setQueue((current) => current.filter((item) => existing.has(item.id)));
      setHistory((current) => current.filter((entry) => existing.has(entry.item.id)));
    });
  }, [db, enqueue]);

  const status: DeckStatus = loading ? 'loading' : queue.length === 0 && exhausted ? 'done' : 'ready';

  return {
    status,
    queue,
    counts,
    remaining,
    restored,
    canUndo: history.length > 0,
    decide,
    undo,
    prune,
  };
}
