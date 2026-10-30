import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { migrateDbIfNeeded } from '@/db/migrations';
import { hasLibraryAccess, useMediaPermission } from '@/features/media/permissions';

SplashScreen.preventAutoHideAsync();

// Navigation chrome (screen and sheet backgrounds, borders) in the app's own palette.
const NAVIGATION_THEMES = {
  light: {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: Colors.light.background, card: Colors.light.background, text: Colors.light.text },
  },
  dark: {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: Colors.dark.background, card: Colors.dark.background, text: Colors.dark.text },
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={styles.flex}>
      <ThemeProvider value={NAVIGATION_THEMES[colorScheme === 'dark' ? 'dark' : 'light']}>
        <StatusBar style="auto" />
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
        <Stack.Screen name="swipe" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="viewer/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="trash" options={{ presentation: 'modal' }} />
        <Stack.Screen name="groups" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="filters"
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true }}
        />
        <Stack.Screen name="summary" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!granted}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}

// Last-resort screen for a render error anywhere below the root, instead of a blank app.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ThemedView style={styles.flex}>
      <View style={styles.errorContent}>
        <ThemedText type="subtitle">Something went wrong</ThemedText>
        <ThemedText themeColor="textSecondary">
          Nothing was deleted. Your decisions so far are saved.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {error.message}
        </ThemedText>
        <Button title="Try again" onPress={retry} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  errorContent: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
