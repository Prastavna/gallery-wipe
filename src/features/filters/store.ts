import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { getSetting, setSetting } from '@/db/settings';
import { DEFAULT_FILTERS, normalizeFilters, type FilterSpec } from '@/features/filters/spec';

const FILTERS_KEY = 'filters';

type FilterState = {
  spec: FilterSpec;
  load: (db: SQLiteDatabase) => Promise<void>;
  apply: (db: SQLiteDatabase, spec: FilterSpec) => Promise<void>;
};

/** The filters the next deck will use; persisted so they survive restarts. */
export const useFilters = create<FilterState>((set) => ({
  spec: DEFAULT_FILTERS,
  load: async (db) => {
    set({ spec: normalizeFilters(await getSetting<Partial<FilterSpec>>(db, FILTERS_KEY)) });
  },
  apply: async (db, spec) => {
    set({ spec });
    await setSetting(db, FILTERS_KEY, spec);
  },
}));
