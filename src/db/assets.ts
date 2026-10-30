import type { SQLiteDatabase } from 'expo-sqlite';

export type AssetRow = {
  id: string;
  mediaType: 'image' | 'video';
  filename: string | null;
  ext: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  creationTime: number | null;
  modificationTime: number | null;
  isFavorite: boolean;
  isScreenshot: boolean;
  subtypes: string | null;
};

export type LibraryStats = {
  total: number;
  photos: number;
  videos: number;
  screenshots: number;
  albums: number;
  reviewed: number;
  pendingTrash: number;
};

// Rows are passed as one JSON array per statement so a page of 500 assets costs a single native
// call instead of 500. Enrichment columns (size, in_cloud) survive an upsert unless the file was
// modified since they were computed.
const UPSERT_ASSETS = `
  INSERT INTO assets (
    id, media_type, filename, ext, width, height, duration, creation_time,
    modification_time, is_favorite, is_screenshot, subtypes, scan_id
  )
  SELECT
    json_extract(j.value, '$.id'),
    json_extract(j.value, '$.mediaType'),
    json_extract(j.value, '$.filename'),
    json_extract(j.value, '$.ext'),
    json_extract(j.value, '$.width'),
    json_extract(j.value, '$.height'),
    json_extract(j.value, '$.duration'),
    json_extract(j.value, '$.creationTime'),
    json_extract(j.value, '$.modificationTime'),
    json_extract(j.value, '$.isFavorite'),
    json_extract(j.value, '$.isScreenshot'),
    json_extract(j.value, '$.subtypes'),
    $scanId
  FROM json_each($rows) AS j
  WHERE true
  ON CONFLICT (id) DO UPDATE SET
    media_type        = excluded.media_type,
    filename          = excluded.filename,
    ext               = excluded.ext,
    width             = excluded.width,
    height            = excluded.height,
    duration          = excluded.duration,
    creation_time     = excluded.creation_time,
    is_favorite       = excluded.is_favorite,
    is_screenshot     = excluded.is_screenshot,
    subtypes          = excluded.subtypes,
    scan_id           = excluded.scan_id,
    size        = CASE WHEN assets.modification_time IS excluded.modification_time THEN assets.size ELSE NULL END,
    in_cloud    = CASE WHEN assets.modification_time IS excluded.modification_time THEN assets.in_cloud ELSE NULL END,
    enriched_at = CASE WHEN assets.modification_time IS excluded.modification_time THEN assets.enriched_at ELSE NULL END,
    modification_time = excluded.modification_time
`;

export async function upsertAssets(db: SQLiteDatabase, rows: AssetRow[], scanId: number) {
  if (rows.length === 0) return;
  const json = JSON.stringify(
    rows.map((row) => ({
      ...row,
      isFavorite: row.isFavorite ? 1 : 0,
      isScreenshot: row.isScreenshot ? 1 : 0,
    }))
  );
  await db.runAsync(UPSERT_ASSETS, { $rows: json, $scanId: scanId });
}

export async function upsertAlbum(
  db: SQLiteDatabase,
  album: { id: string; title: string },
  assetIds: string[],
  scanId: number
) {
  await db.runAsync(
    `INSERT INTO albums (id, title, scan_id) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET title = excluded.title, scan_id = excluded.scan_id`,
    album.id,
    album.title,
    scanId
  );
  await db.runAsync('DELETE FROM asset_albums WHERE album_id = ?', album.id);
  await db.runAsync(
    `INSERT OR IGNORE INTO asset_albums (asset_id, album_id)
     SELECT j.value, ? FROM json_each(?) AS j`,
    album.id,
    JSON.stringify(assetIds)
  );
}

// Android has no screenshot subtype, so screenshots are recognised by the folder they live in.
export async function markScreenshotsFromAlbums(db: SQLiteDatabase) {
  await db.runAsync(
    `UPDATE assets SET is_screenshot = 1
     WHERE id IN (
       SELECT aa.asset_id FROM asset_albums aa
       JOIN albums al ON al.id = aa.album_id
       WHERE al.title LIKE '%screenshot%'
     )`
  );
}

// Removes everything a completed scan did not see. Only call after a scan finished successfully.
export async function sweepStaleRows(db: SQLiteDatabase, scanId: number) {
  await db.runAsync('DELETE FROM assets WHERE scan_id <> ?', scanId);
  await db.runAsync('DELETE FROM albums WHERE scan_id <> ?', scanId);
  await db.runAsync(
    `DELETE FROM asset_albums
     WHERE asset_id NOT IN (SELECT id FROM assets) OR album_id NOT IN (SELECT id FROM albums)`
  );
}

export async function getLibraryStats(db: SQLiteDatabase): Promise<LibraryStats> {
  const row = await db.getFirstAsync<LibraryStats>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(media_type = 'image'), 0) AS photos,
       COALESCE(SUM(media_type = 'video'), 0) AS videos,
       COALESCE(SUM(is_screenshot), 0) AS screenshots,
       (SELECT COUNT(*) FROM albums) AS albums,
       (SELECT COUNT(*) FROM decisions d JOIN assets a ON a.id = d.asset_id) AS reviewed,
       (SELECT COUNT(*) FROM decisions d JOIN assets a ON a.id = d.asset_id
        WHERE d.decision = 'trash') AS pendingTrash
     FROM assets`
  );
  return (
    row ?? { total: 0, photos: 0, videos: 0, screenshots: 0, albums: 0, reviewed: 0, pendingTrash: 0 }
  );
}
