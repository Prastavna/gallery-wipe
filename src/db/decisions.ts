import type { SQLiteDatabase } from 'expo-sqlite';

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
  creationTime: number | null;
  filename: string | null;
};

// What the deck shows: items with no decision yet, plus ones skipped in an earlier session.
// "Keep" is permanent, "trash" waits in the Trash screen, favorites are never offered.
const DECK_FILTER = `
  a.is_favorite = 0
  AND (d.asset_id IS NULL OR (d.decision = 'skip' AND d.session_id IS NOT $sessionId))
`;

export async function getDeckItems(
  db: SQLiteDatabase,
  sessionId: number,
  excludeIds: string[],
  limit: number
): Promise<DeckItem[]> {
  return db.getAllAsync<DeckItem>(
    `SELECT a.id, a.media_type AS mediaType, a.duration, a.width, a.height,
            a.creation_time AS creationTime, a.filename
     FROM assets a LEFT JOIN decisions d ON d.asset_id = a.id
     WHERE ${DECK_FILTER}
       AND a.id NOT IN (SELECT value FROM json_each($exclude))
     ORDER BY a.creation_time DESC, a.id DESC
     LIMIT $limit`,
    { $sessionId: sessionId, $exclude: JSON.stringify(excludeIds), $limit: limit }
  );
}

export async function countDeckItems(db: SQLiteDatabase, sessionId: number): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM assets a LEFT JOIN decisions d ON d.asset_id = a.id
     WHERE ${DECK_FILTER}`,
    { $sessionId: sessionId }
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
