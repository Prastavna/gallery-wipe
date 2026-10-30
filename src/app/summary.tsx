import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getLifetime, type Lifetime } from '@/db/trash';
import { haptic } from '@/features/preferences';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, numberFormat } from '@/utils/format';

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const params = useLocalSearchParams<{ deleted: string; bytes: string; remaining: string }>();
  const deleted = Number(params.deleted ?? 0);
  const bytes = Number(params.bytes ?? 0);
  const remaining = Number(params.remaining ?? 0);
  const [lifetime, setLifetime] = useState<Lifetime | null>(null);

  useEffect(() => {
    haptic.success();
    getLifetime(db).then(setLifetime);
  }, [db]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.copy}>
          <ThemedText type="title" accessibilityRole="header">
            {bytes > 0 ? formatBytes(bytes) : numberFormat.format(deleted)}
          </ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary">
            {bytes > 0 ? 'freed' : deleted === 1 ? 'item deleted' : 'items deleted'}
          </ThemedText>
          <View style={[styles.rule, { backgroundColor: theme.line }]} />
          {bytes > 0 && (
            <ThemedText themeColor="textSecondary">
              {`${numberFormat.format(deleted)} ${deleted === 1 ? 'item' : 'items'} deleted.`}
            </ThemedText>
          )}
          {remaining > 0 && (
            <ThemedText themeColor="textSecondary">
              {`${numberFormat.format(remaining)} items are still in Trash.`}
            </ThemedText>
          )}
          {lifetime && lifetime.bytes > bytes && (
            <ThemedText themeColor="textSecondary">
              {`${formatBytes(lifetime.bytes)} freed with Gallery Wipe so far.`}
            </ThemedText>
          )}
        </View>
        <Button title="Done" onPress={() => router.back()} />
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
    padding: Spacing.four,
  },
  // Left-aligned and low on the screen, like a total at the foot of a receipt.
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: Spacing.one,
    paddingBottom: Spacing.five,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.three,
  },
});
