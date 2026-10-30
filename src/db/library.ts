import type { SQLiteDatabase } from 'expo-sqlite';

import type { Decision } from '@/db/decisions';
import type { DeckQuery } from '@/features/filters/query';

export type LibraryItem = {
  id: string;
  mediaType: 'image' | 'video';
  duration: number | null;
  size: number | null;
  decision: Decision | null;
};

export async function getLibraryPage(
  db: SQLiteDatabase,
  query: DeckQuery,
  offset: number,
  limit: number
): Promise<LibraryItem[]> {
  return db.getAllAsync<LibraryItem>(
    `SELECT a.id, a.media_type AS mediaType, a.duration, a.size, d.decision
     FROM assets a LEFT JOIN decisions d ON d.asset_id = a.id
     WHERE ${query.where}
     ORDER BY ${query.orderBy}
     LIMIT $limit OFFSET $offset`,
    { ...query.params, $limit: limit, $offset: offset }
  );
}
