import { Asset } from 'expo-media-library';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { recordDeleted } from '@/db/trash';

// Android sends the URIs in one Binder transaction, which caps out around 1 MB; iOS has no limit
// so everything goes in one batch and the user sees a single confirmation.
const ANDROID_BATCH_SIZE = 400;

export type DeleteResult = {
  deleted: number;
  bytesFreed: number;
  // True when the user dismissed an OS confirmation (or deletion otherwise failed) part-way.
  stopped: boolean;
};

/**
 * Deletes assets through the OS, which asks the user to confirm (iOS, Android 11+). Each batch is
 * all-or-nothing; we stop at the first batch that is declined and keep the rest in the Trash.
 */
export async function deleteAssets(db: SQLiteDatabase, ids: string[]): Promise<DeleteResult> {
  const batchSize = Platform.OS === 'android' ? ANDROID_BATCH_SIZE : ids.length;
  let deleted = 0;
  let bytesFreed = 0;

  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = ids.slice(start, start + batchSize);
    try {
      await Asset.delete(batch.map((id) => new Asset(id)));
    } catch (error) {
      console.info('Deletion stopped', error);
      return { deleted, bytesFreed, stopped: true };
    }
    bytesFreed += await recordDeleted(db, batch);
    deleted += batch.length;
  }

  return { deleted, bytesFreed, stopped: false };
}

/** Android 10 and older delete immediately with no system prompt, so we must confirm ourselves. */
export function osConfirmsDeletion() {
  return Platform.OS === 'ios' || (typeof Platform.Version === 'number' && Platform.Version >= 30);
}
