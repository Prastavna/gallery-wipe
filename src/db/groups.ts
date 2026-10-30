import type { SQLiteDatabase } from 'expo-sqlite';

export type GroupKind = 'duplicates' | 'similar';

export type GroupMember = {
  id: string;
  groupKey: string;
  mediaType: 'image' | 'video';
  creationTime: number | null;
  width: number | null;
  height: number | null;
  size: number | null;
  isFavorite: number;
};

export type MediaGroup = {
  key: string;
  kind: GroupKind;
  members: GroupMember[];
  // The member we suggest keeping; everything else is suggested for deletion.
  keeperId: string;
  // Bytes freed by deleting every member except the keeper (measured sizes only).
  reclaimableBytes: number;
};

// Photos taken this close together, in the same orientation, count as one burst of similar shots.
export const SIMILAR_GAP_MS = 2000;

// Items already marked to delete are left out; a group needs two or more remaining members.
const NOT_TRASHED = `NOT EXISTS (SELECT 1 FROM decisions d WHERE d.asset_id = a.id AND d.decision = 'trash')`;

/**
 * Exact duplicates: same byte size, dimensions, media type and duration. Copies of one file
 * (re-saved downloads, messaging-app copies) match; different photos practically never do.
 * Only measured assets can match, so results grow as background size measurement runs.
 */
export async function getDuplicateGroups(db: SQLiteDatabase): Promise<MediaGroup[]> {
  const rows = await db.getAllAsync<GroupMember>(
    `WITH candidates AS (
       SELECT a.* FROM assets a WHERE a.size IS NOT NULL AND ${NOT_TRASHED}
     ),
     keys AS (
       SELECT size, width, height, media_type, COALESCE(duration, 0) AS duration
       FROM candidates
       GROUP BY size, width, height, media_type, COALESCE(duration, 0)
       HAVING COUNT(*) > 1
     )
     SELECT c.id, c.media_type AS mediaType, c.creation_time AS creationTime, c.width, c.height,
            c.size, c.is_favorite AS isFavorite,
            c.size || ':' || IFNULL(c.width, '') || 'x' || IFNULL(c.height, '') || ':' || c.media_type
              || ':' || COALESCE(c.duration, 0) AS groupKey
     FROM candidates c
     JOIN keys k ON k.size = c.size AND k.width IS c.width AND k.height IS c.height
       AND k.media_type = c.media_type AND k.duration = COALESCE(c.duration, 0)
     ORDER BY c.size DESC, groupKey, c.creation_time`
  );
  return toGroups(rows, 'duplicates');
}

/** Bursts and retakes: photos (not screenshots) within SIMILAR_GAP_MS of the previous one, same orientation. */
export async function getSimilarGroups(db: SQLiteDatabase): Promise<MediaGroup[]> {
  const rows = await db.getAllAsync<GroupMember>(
    `WITH photos AS (
       SELECT a.id, a.creation_time, a.width, a.height, a.size, a.is_favorite,
              (a.width >= a.height) AS landscape
       FROM assets a
       WHERE a.media_type = 'image' AND a.is_screenshot = 0 AND a.creation_time IS NOT NULL
         AND ${NOT_TRASHED}
     ),
     marked AS (
       SELECT *,
         CASE WHEN creation_time - LAG(creation_time) OVER w <= $gap
               AND landscape IS LAG(landscape) OVER w
              THEN 0 ELSE 1 END AS starts_group
       FROM photos
       WINDOW w AS (ORDER BY creation_time, id)
     ),
     numbered AS (
       SELECT *, SUM(starts_group) OVER (ORDER BY creation_time, id ROWS UNBOUNDED PRECEDING) AS grp
       FROM marked
     ),
     sized AS (
       SELECT *, COUNT(*) OVER (PARTITION BY grp) AS group_size FROM numbered
     )
     SELECT id, 'image' AS mediaType, creation_time AS creationTime, width, height, size,
            is_favorite AS isFavorite, 'burst:' || grp AS groupKey
     FROM sized
     WHERE group_size > 1
     ORDER BY creation_time DESC, id`,
    { $gap: SIMILAR_GAP_MS }
  );
  return toGroups(rows, 'similar');
}

function toGroups(rows: GroupMember[], kind: GroupKind): MediaGroup[] {
  const byKey = new Map<string, GroupMember[]>();
  for (const row of rows) {
    const members = byKey.get(row.groupKey);
    if (members) members.push(row);
    else byKey.set(row.groupKey, [row]);
  }
  return [...byKey.entries()].map(([key, members]) => {
    const keeperId = suggestKeeper(members, kind).id;
    const reclaimableBytes = members.reduce((sum, member) => sum + (member.id === keeperId ? 0 : (member.size ?? 0)), 0);
    return { key, kind, members, keeperId, reclaimableBytes };
  });
}

/**
 * Favorites always win. Otherwise: for duplicates the earliest copy (most likely the original);
 * for similar shots the highest resolution, then the largest file (usually the sharpest).
 */
export function suggestKeeper(members: GroupMember[], kind: GroupKind): GroupMember {
  return [...members].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite;
    if (kind === 'duplicates') return (a.creationTime ?? Infinity) - (b.creationTime ?? Infinity);
    const pixels = (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);
    return pixels !== 0 ? pixels : (b.size ?? 0) - (a.size ?? 0);
  })[0];
}
