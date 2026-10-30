import type { SQLiteDatabase } from 'expo-sqlite';

export type AlbumOption = { id: string; title: string; count: number };
export type ExtensionOption = { ext: string; count: number };

export async function getAlbumOptions(db: SQLiteDatabase): Promise<AlbumOption[]> {
  return db.getAllAsync<AlbumOption>(
    `SELECT al.id, al.title, COUNT(aa.asset_id) AS count
     FROM albums al JOIN asset_albums aa ON aa.album_id = al.id
     GROUP BY al.id
     ORDER BY count DESC, al.title COLLATE NOCASE`
  );
}

export async function getExtensionOptions(db: SQLiteDatabase): Promise<ExtensionOption[]> {
  return db.getAllAsync<ExtensionOption>(
    `SELECT ext, COUNT(*) AS count FROM assets
     WHERE ext IS NOT NULL GROUP BY ext ORDER BY count DESC`
  );
}

/** How many assets still have no size, for showing that size filters are still filling in. */
export async function countUnmeasured(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM assets WHERE enriched_at IS NULL'
  );
  return row?.count ?? 0;
}
