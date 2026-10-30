import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useMediaPermission } from '@/features/media/permissions';

export default function OnboardingScreen() {
  const response = useMediaPermission((state) => state.response);
  const request = useMediaPermission((state) => state.request);

  // Once the OS stops showing the prompt, the only way forward is the system Settings app.
  const blocked = response?.canAskAgain === false;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.copy}>
          <ThemedText type="subtitle">Free up space, one swipe at a time</ThemedText>
          <ThemedText themeColor="textSecondary">
            Gallery Wipe shows your photos and videos one by one. Swipe left to delete, right to
            keep. Nothing is deleted until you review your picks and confirm.
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Everything stays on your device. Your library is never uploaded.
          </ThemedText>
        </ThemedView>

        {blocked ? (
          <ThemedView style={styles.actions}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Access to your library is turned off. Allow photos and videos in Settings to continue.
            </ThemedText>
            <Button title="Open Settings" onPress={() => Linking.openSettings()} />
          </ThemedView>
        ) : (
          <Button title="Allow access to photos" onPress={request} />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.four,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  actions: {
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
});
