import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { migrateDbIfNeeded } from '@/db/migrations';
import { hasLibraryAccess, useMediaPermission } from '@/features/media/permissions';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SQLiteProvider databaseName="gallery-wipe.db" onInit={migrateDbIfNeeded}>
          <RootStack />
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const response = useMediaPermission((state) => state.response);
  const refresh = useMediaPermission((state) => state.refresh);

  useEffect(() => {
    refresh();
    // The user may grant or revoke access in system Settings while we are backgrounded.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (response) SplashScreen.hideAsync();
  }, [response]);

  if (!response) return null;

  const granted = hasLibraryAccess(response);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={granted}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!granted}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
