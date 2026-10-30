import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from '@/db/settings';

export type TrashItem = {
  id: string;
  mediaType: 'image' | 'video';
  creationTime: number | null;
  size: number | null;
  inCloud: number | null;
};

export type Lifetime = {
  items: number;
  bytes: number;
};

const LIFETIME_KEY = 'lifetime';

export async function getTrashItems(db: SQLiteDatabase): Promise<TrashItem[]> {
  return db.getAllAsync<TrashItem>(
    `SELECT a.id, a.media_type AS mediaType, a.creation_time AS creationTime, a.size,
            a.in_cloud AS inCloud
     FROM decisions d JOIN assets a ON a.id = d.asset_id
     WHERE d.decision = 'trash'
     ORDER BY d.decided_at DESC`
  );
}

// Back to undecided, so the items show up in the next deck.
export async function restoreFromTrash(db: SQLiteDatabase, ids: string[]) {
  await db.runAsync(
    `DELETE FROM decisions
     WHERE decision = 'trash' AND asset_id IN (SELECT value FROM json_each(?))`,
    JSON.stringify(ids)
  );
}

/**
 * Records that the OS deleted these assets: credits the freed bytes to the sessions the decisions
 * came from and to the lifetime total, then drops every row that referenced them.
 * Returns the bytes freed, counting only items whose size is known.
 */
export async function recordDeleted(db: SQLiteDatabase, ids: string[]): Promise<number> {
  const json = JSON.stringify(ids);
  let bytes = 0;

  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ bytes: number }>(
      `SELECT COALESCE(SUM(size), 0) AS bytes FROM assets WHERE id IN (SELECT value FROM json_each(?))`,
      json
    );
    bytes = row?.bytes ?? 0;

    await db.runAsync(
      `UPDATE sessions SET bytes_freed = bytes_freed + COALESCE((
         SELECT SUM(a.size) FROM decisions d JOIN assets a ON a.id = d.asset_id
         WHERE d.session_id = sessions.id AND d.asset_id IN (SELECT value FROM json_each($ids))
       ), 0)
       WHERE id IN (
         SELECT session_id FROM decisions WHERE asset_id IN (SELECT value FROM json_each($ids))
       )`,
      { $ids: json }
    );
    for (const table of ['asset_albums', 'decisions']) {
      await db.runAsync(
        `DELETE FROM ${table} WHERE asset_id IN (SELECT value FROM json_each(?))`,
        json
      );
    }
    await db.runAsync('DELETE FROM assets WHERE id IN (SELECT value FROM json_each(?))', json);

    const lifetime = await getLifetime(db);
    await setSetting(db, LIFETIME_KEY, {
      items: lifetime.items + ids.length,
      bytes: lifetime.bytes + bytes,
    } satisfies Lifetime);
  });

  return bytes;
}

export async function getLifetime(db: SQLiteDatabase): Promise<Lifetime> {
  return (await getSetting<Lifetime>(db, LIFETIME_KEY)) ?? { items: 0, bytes: 0 };
}
