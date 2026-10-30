import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { fillMissingSizes } from '@/features/media/sizes';

const BATCH_SIZE = 60;
// Breathing room between batches so the JS thread stays free for the deck's gestures.
const PAUSE_BETWEEN_BATCHES_MS = 150;

export const useSizeEnrichment = create<{ running: boolean; measured: number }>(() => ({
  running: false,
  measured: 0,
}));

let running: Promise<void> | null = null;
let stopRequested = false;

/**
 * Measures file sizes for every asset that has none, in the background, videos first and newest
 * first (where the big wins usually are). Safe to call repeatedly; only one run happens at a time.
 */
export function startSizeEnrichment(db: SQLiteDatabase): Promise<void> {
  stopRequested = false;
  if (running) return running;

  running = (async () => {
    useSizeEnrichment.setState({ running: true, measured: 0 });
    try {
      while (!stopRequested) {
        const batch = await db.getAllAsync<{ id: string }>(
          `SELECT id FROM assets WHERE enriched_at IS NULL
           ORDER BY media_type = 'video' DESC, creation_time DESC
           LIMIT ?`,
          BATCH_SIZE
        );
        if (batch.length === 0) break;
        await fillMissingSizes(db, batch.map((row) => row.id));
        useSizeEnrichment.setState((state) => ({ measured: state.measured + batch.length }));
        await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS));
      }
    } catch (error) {
      console.warn('Size measurement stopped', error);
    } finally {
      useSizeEnrichment.setState({ running: false });
      running = null;
    }
  })();
  return running;
}

export function stopSizeEnrichment() {
  stopRequested = true;
}
