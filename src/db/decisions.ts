import type { SQLiteDatabase } from 'expo-sqlite';

import type { DeckQuery } from '@/features/filters/query';

export type Decision = 'keep' | 'trash' | 'skip';

export type DecisionRecord = {
  decision: Decision;
  decidedAt: number;
  sessionId: number | null;
};

export type DeckItem = {
  id: string;
  mediaType: 'image' | 'video';
  // Milliseconds; videos only.
  duration: number | null;
  width: number | null;
  height: number | null;
  // Bytes, once measured.
  size: number | null;
  // 1 when iOS reported the original as iCloud-only (it downloads on display).
  inCloud: number | null;
  creationTime: number | null;
  filename: string | null;
};

// Deck queries come from buildDeckQuery (src/features/filters/query.ts), whose WHERE runs over
// `assets a LEFT JOIN decisions d ON d.asset_id = a.id`.
export async function getDeckItems(
  db: SQLiteDatabase,
  query: DeckQuery,
  excludeIds: string[],
  limit: number
): Promise<DeckItem[]> {
  return db.getAllAsync<DeckItem>(
    `SELECT a.id, a.media_type AS mediaType, a.duration, a.width, a.height, a.size, a.in_cloud AS inCloud,
            a.creation_time AS creationTime, a.filename
     FROM assets a LEFT JOIN decisions d ON d.asset_id = a.id
     WHERE ${query.where}
       AND a.id NOT IN (SELECT value FROM json_each($exclude))
     ORDER BY ${query.orderBy}
     LIMIT $limit`,
    { ...query.params, $exclude: JSON.stringify(excludeIds), $limit: limit }
  );
}

export async function countDeckItems(db: SQLiteDatabase, query: DeckQuery): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM assets a LEFT JOIN decisions d ON d.asset_id = a.id
     WHERE ${query.where}`,
    query.params
  );
  return row?.count ?? 0;
}

export async function getDecision(db: SQLiteDatabase, assetId: string): Promise<DecisionRecord | null> {
  return db.getFirstAsync<DecisionRecord>(
    `SELECT decision, decided_at AS decidedAt, session_id AS sessionId
     FROM decisions WHERE asset_id = ?`,
    assetId
  );
}

export async function setDecision(db: SQLiteDatabase, assetId: string, record: DecisionRecord) {
  await db.runAsync(
    `INSERT INTO decisions (asset_id, decision, decided_at, session_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (asset_id) DO UPDATE SET
       decision = excluded.decision,
       decided_at = excluded.decided_at,
       session_id = excluded.session_id`,
    assetId,
    record.decision,
    record.decidedAt,
    record.sessionId
  );
}

// Puts an asset back the way it was before a decision, for undo.
export async function restoreDecision(
  db: SQLiteDatabase,
  assetId: string,
  previous: DecisionRecord | null
) {
  if (previous) {
    await setDecision(db, assetId, previous);
  } else {
    await db.runAsync('DELETE FROM decisions WHERE asset_id = ?', assetId);
  }
}

export async function startSession(db: SQLiteDatabase, filterSpec: unknown): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO sessions (filter_spec, started_at) VALUES (?, ?)',
    JSON.stringify(filterSpec),
    Date.now()
  );
  return result.lastInsertRowId;
}

export async function endSession(db: SQLiteDatabase, sessionId: number) {
  await db.runAsync(
    `UPDATE sessions SET
       ended_at = $now,
       kept    = (SELECT COUNT(*) FROM decisions WHERE session_id = $id AND decision = 'keep'),
       trashed = (SELECT COUNT(*) FROM decisions WHERE session_id = $id AND decision = 'trash'),
       skipped = (SELECT COUNT(*) FROM decisions WHERE session_id = $id AND decision = 'skip')
     WHERE id = $id`,
    { $now: Date.now(), $id: sessionId }
  );
}

/** Forgets every decision of one kind, e.g. so kept items show up in decks again. */
export async function clearDecisions(db: SQLiteDatabase, decision: Decision): Promise<number> {
  const result = await db.runAsync('DELETE FROM decisions WHERE decision = ?', decision);
  return result.changes;
}

export async function countDecisions(db: SQLiteDatabase): Promise<Record<Decision, number>> {
  const rows = await db.getAllAsync<{ decision: Decision; count: number }>(
    `SELECT d.decision, COUNT(*) AS count FROM decisions d JOIN assets a ON a.id = d.asset_id
     GROUP BY d.decision`
  );
  const counts: Record<Decision, number> = { keep: 0, trash: 0, skip: 0 };
  for (const row of rows) counts[row.decision] = row.count;
  return counts;
}

/** Sends items to Trash outside any swipe session (e.g. from duplicate groups). */
export async function markForDeletion(db: SQLiteDatabase, ids: string[]) {
  await db.runAsync(
    `INSERT INTO decisions (asset_id, decision, decided_at, session_id)
     SELECT value, 'trash', $now, NULL FROM json_each($ids) WHERE true
     ON CONFLICT (asset_id) DO UPDATE SET
       decision = 'trash', decided_at = excluded.decided_at, session_id = NULL`,
    { $ids: JSON.stringify(ids), $now: Date.now() }
  );
}
