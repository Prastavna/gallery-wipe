import { addListener } from 'expo-media-library';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { loadLastScan, requestScan } from '@/features/media/indexer';

const CHANGE_DEBOUNCE_MS = 1000;

/**
 * Keeps the SQLite index in step with the device library: scans on mount, when the app returns to
 * the foreground, and (debounced) whenever the library reports a change. Android's change events
 * carry no details, so every trigger runs the same full metadata scan.
 */
export function useLibrarySync() {
  const db = useSQLiteContext();

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;

    loadLastScan(db).then(() => requestScan(db));

    const changes = addListener(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => requestScan(db), CHANGE_DEBOUNCE_MS);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') requestScan(db);
    });

    return () => {
      clearTimeout(debounce);
      changes.remove();
      appState.remove();
    };
  }, [db]);
}
