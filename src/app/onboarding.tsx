import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontFamily, Spacing } from '@/constants/theme';
import { useMediaPermission } from '@/features/media/permissions';
import { useTheme } from '@/hooks/use-theme';

export default function OnboardingScreen() {
  const theme = useTheme();
  const response = useMediaPermission((state) => state.response);
  const request = useMediaPermission((state) => state.request);

  // Once the OS stops showing the prompt, the only way forward is the system Settings app.
  const blocked = response?.canAskAgain === false;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.copy}>
          <ThemedText type="subtitle" accessibilityRole="header" style={styles.headline}>
            Free up space, one swipe at a time
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            Gallery Wipe shows your photos and videos one by one. Nothing is deleted until you review
            your picks and confirm.
          </ThemedText>

          <View style={[styles.legend, { borderColor: theme.line }]}>
            <Gesture icon={{ ios: 'arrow.left', android: 'arrow_back' }} direction="left" label="Delete" color={theme.danger} />
            <Gesture icon={{ ios: 'arrow.right', android: 'arrow_forward' }} direction="right" label="Keep" color={theme.success} />
            <Gesture icon={{ ios: 'arrow.up', android: 'arrow_upward' }} direction="up" label="Later" color={theme.text} />
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            Everything stays on your device. Your library is never uploaded.
          </ThemedText>
        </View>

        {blocked ? (
          <View style={styles.actions}>
            <ThemedText type="small" themeColor="textSecondary">
              Access to your library is turned off. Allow photos and videos in Settings to continue.
            </ThemedText>
            <Button title="Open Settings" onPress={() => Linking.openSettings()} />
          </View>
        ) : (
          <Button title="Allow access to photos" onPress={request} />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

type GestureProps = { icon: SymbolViewProps['name']; direction: string; label: string; color: string };

function Gesture({ icon, direction, label, color }: GestureProps) {
  const theme = useTheme();
  return (
    <View style={styles.gesture} accessible accessibilityLabel={`Swipe ${direction} to ${label.toLowerCase()}`}>
      <SymbolView name={icon} size={18} tintColor={theme.textSecondary} />
      <Text style={[styles.mark, { color }]}>{label}</Text>
    </View>
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
  headline: {
    fontSize: 48,
    lineHeight: 50,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    marginVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gesture: {
    alignItems: 'center',
    gap: Spacing.one,
    flex: 1,
  },
  mark: {
    fontFamily: FontFamily.marker,
    fontSize: 26,
    lineHeight: 34,
  },
  actions: {
    gap: Spacing.three,
  },
});
