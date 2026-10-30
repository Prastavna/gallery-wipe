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
import { formatBytes, numberFormat } from '@/utils/format';

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ deleted: string; bytes: string; remaining: string }>();
  const deleted = Number(params.deleted ?? 0);
  const bytes = Number(params.bytes ?? 0);
  const remaining = Number(params.remaining ?? 0);
  const [lifetime, setLifetime] = useState<Lifetime | null>(null);

  useEffect(() => {
    getLifetime(db).then(setLifetime);
  }, [db]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.copy}>
          <ThemedText type="small" themeColor="textSecondary">
            {`Deleted ${numberFormat.format(deleted)} items`}
          </ThemedText>
          <ThemedText type="title" style={styles.center}>
            {bytes > 0 ? `${formatBytes(bytes)} freed` : 'Done'}
          </ThemedText>
          {remaining > 0 && (
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {`${numberFormat.format(remaining)} items are still in Trash.`}
            </ThemedText>
          )}
          {lifetime && lifetime.bytes > bytes && (
            <ThemedText themeColor="textSecondary" style={styles.center}>
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
  copy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
});
