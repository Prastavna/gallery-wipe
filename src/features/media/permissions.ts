import {
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
  type GranularPermission,
  type PermissionResponse,
} from 'expo-media-library';
import { create } from 'zustand';

const GRANULAR: GranularPermission[] = ['photo', 'video'];

type PermissionState = {
  response: PermissionResponse | null;
  refresh: () => Promise<void>;
  request: () => Promise<void>;
  manageLimitedAccess: () => Promise<void>;
};

// A store rather than expo-media-library's usePermissions hook, so the root layout's route guard
// and the onboarding screen see the same answer as soon as it changes.
export const useMediaPermission = create<PermissionState>((set) => ({
  response: null,
  refresh: async () => {
    set({ response: await getPermissionsAsync(false, GRANULAR) });
  },
  request: async () => {
    set({ response: await requestPermissionsAsync(false, GRANULAR) });
  },
  manageLimitedAccess: async () => {
    await presentPermissionsPicker(['photo', 'video']);
    set({ response: await getPermissionsAsync(false, GRANULAR) });
  },
}));

export function hasLibraryAccess(response: PermissionResponse | null) {
  return response?.granted === true;
}
