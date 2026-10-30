import { File } from 'expo-file-system';
import { Asset } from 'expo-media-library';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

const CONCURRENCY = 4;

type Measurement = {
  id: string;
  size: number | null;
  inCloud: boolean;
};

/**
 * Looks up file sizes for the given assets that have not been measured yet, and stores them.
 * iCloud-only assets are skipped (and flagged) because resolving their file would download them.
 */
export async function fillMissingSizes(db: SQLiteDatabase, ids: string[]) {
  const pending = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM assets
     WHERE id IN (SELECT value FROM json_each(?)) AND enriched_at IS NULL`,
    JSON.stringify(ids)
  );
  if (pending.length === 0) return;

  const results: Measurement[] = [];
  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const { id } = pending[next++];
      results.push(await measure(id));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

  await db.runAsync(
    `UPDATE assets SET
       size = json_extract(j.value, '$.size'),
       in_cloud = json_extract(j.value, '$.inCloud'),
       enriched_at = $now
     FROM json_each($rows) AS j
     WHERE assets.id = json_extract(j.value, '$.id')`,
    {
      $now: Date.now(),
      $rows: JSON.stringify(results.map((r) => ({ ...r, inCloud: r.inCloud ? 1 : 0 }))),
    }
  );
}

async function measure(id: string): Promise<Measurement> {
  try {
    if (Platform.OS === 'ios') {
      const asset = new Asset(id);
      if (await asset.getIsInCloud()) return { id, size: null, inCloud: true };
      return { id, size: sizeOf(await asset.getUri()), inCloud: false };
    }
    // Android asset ids are content:// URIs; their size comes straight from MediaStore.
    return { id, size: sizeOf(id), inCloud: false };
  } catch {
    return { id, size: null, inCloud: false };
  }
}

// expo-file-system reports 0 for files it cannot read, which is never a real photo or video.
function sizeOf(uri: string) {
  const size = new File(uri).size;
  return size > 0 ? size : null;
}
