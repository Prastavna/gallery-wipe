import { addListener } from 'expo-media-library';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useFilters } from '@/features/filters/store';
import { loadLastScan, requestScan } from '@/features/media/indexer';
import { startSizeEnrichment, stopSizeEnrichment } from '@/features/media/size-enrichment';
import { usePreferences } from '@/features/preferences';

const CHANGE_DEBOUNCE_MS = 1000;

/**
 * Keeps the SQLite index in step with the device library: scans on mount, when the app returns to
 * the foreground, and (debounced) whenever the library reports a change. Android's change events
 * carry no details, so every trigger runs the same full metadata scan. After each scan, file sizes
 * for new or changed items are measured in the background.
 */
export function useLibrarySync() {
  const db = useSQLiteContext();

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const sync = () => requestScan(db).then(() => startSizeEnrichment(db));

    useFilters.getState().load(db);
    usePreferences.getState().load(db);
    loadLastScan(db).then(sync);

    const changes = addListener(() => {
      clearTimeout(debounce);
      debounce = setTimeout(sync, CHANGE_DEBOUNCE_MS);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      stopSizeEnrichment();
      clearTimeout(debounce);
      changes.remove();
      appState.remove();
    };
  }, [db]);
}
