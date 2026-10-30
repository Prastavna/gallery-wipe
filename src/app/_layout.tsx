import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { Barlow_600SemiBold } from '@expo-google-fonts/barlow/600SemiBold';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker/400Regular';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, FontFamily, Spacing } from '@/constants/theme';
import { migrateDbIfNeeded } from '@/db/migrations';
import { hasLibraryAccess, useMediaPermission } from '@/features/media/permissions';

SplashScreen.preventAutoHideAsync();

const FONTS = {
  [FontFamily.regular]: Barlow_400Regular,
  [FontFamily.medium]: Barlow_500Medium,
  [FontFamily.semiBold]: Barlow_600SemiBold,
  [FontFamily.condensed]: BarlowCondensed_600SemiBold,
  [FontFamily.condensedBold]: BarlowCondensed_700Bold,
  [FontFamily.marker]: PermanentMarker_400Regular,
};

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
  // On failure the system font stands in; better than a stuck splash screen.
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <ThemeProvider value={NAVIGATION_THEMES[colorScheme === 'dark' ? 'dark' : 'light']}>
        <StatusBar style="auto" />
        <SQLiteProvider databaseName="gallery-wipe.db" onInit={migrateDbIfNeeded}>
          {fontsReady && <RootStack />}
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const response = useMediaPermission((state) => state.response);
  const refresh = useMediaPermission((state) => state.refresh);
  const [refreshError, setRefreshError] = useState<unknown>(null);

  useEffect(() => {
    refresh().catch(setRefreshError);
    // The user may grant or revoke access in system Settings while we are backgrounded.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh().catch(setRefreshError);
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (response) SplashScreen.hideAsync();
  }, [response]);

  // Rethrown during render so the error boundary shows it; otherwise the splash screen never hides.
  if (refreshError && !response) throw refreshError;
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
  // The error may happen before the root stack hides the splash screen, which would cover this.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemedView style={styles.flex}>
      <View style={styles.errorContent}>
        <ThemedText type="subtitle">Something went wrong</ThemedText>
        <ThemedText themeColor="textSecondary">
          Nothing was deleted. Your decisions so far are saved. Try again, or close and reopen the app.
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
