import * as Haptics from 'expo-haptics';
import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { getSetting, setSetting } from '@/db/settings';

const PREFERENCES_KEY = 'preferences';

type Preferences = {
  haptics: boolean;
};

const DEFAULTS: Preferences = { haptics: true };

type PreferencesState = Preferences & {
  load: (db: SQLiteDatabase) => Promise<void>;
  set: (db: SQLiteDatabase, patch: Partial<Preferences>) => Promise<void>;
};

export const usePreferences = create<PreferencesState>((set, get) => ({
  ...DEFAULTS,
  load: async (db) => {
    set({ ...DEFAULTS, ...(await getSetting<Partial<Preferences>>(db, PREFERENCES_KEY)) });
  },
  set: async (db, patch) => {
    set(patch);
    const { haptics } = get();
    await setSetting(db, PREFERENCES_KEY, { haptics } satisfies Preferences);
  },
}));

function enabled() {
  return usePreferences.getState().haptics;
}

/** Haptic feedback that respects the user's preference. Plain functions, so worklets can schedule them. */
export const haptic = {
  // Crossing a swipe threshold, toggling a selection.
  selection: () => {
    if (enabled()) Haptics.selectionAsync();
  },
  light: () => {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  medium: () => {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  success: () => {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  warning: () => {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
};
