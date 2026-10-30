import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getLibraryStats, type LibraryStats } from '@/db/assets';
import { getLifetime, type Lifetime } from '@/db/trash';
import { requestScan, useIndexStatus } from '@/features/media/indexer';
import { useMediaPermission } from '@/features/media/permissions';
import { formatBytes, numberFormat } from '@/utils/format';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { scanning, scanned, lastScan, error, version } = useIndexStatus();
  const limited = useMediaPermission((state) => state.response?.accessPrivileges === 'limited');
  const manageLimitedAccess = useMediaPermission((state) => state.manageLimitedAccess);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [lifetime, setLifetime] = useState<Lifetime | null>(null);

  const refreshStats = useCallback(() => {
    getLibraryStats(db).then(setStats);
    getLifetime(db).then(setLifetime);
  }, [db]);
  // On focus, so counts reflect decisions made in the swipe deck; and after each scan.
  useFocusEffect(refreshStats);
  useEffect(() => {
    if (version > 0) refreshStats();
  }, [version, refreshStats]);

  async function onManageAccess() {
    await manageLimitedAccess();
    await requestScan(db);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Gallery Wipe</ThemedText>

          <Button
            title="Start cleaning"
            disabled={!stats || stats.total === 0}
            onPress={() => router.push('/swipe')}
          />

          {!!stats?.pendingTrash && (
            <Button
              title={`Review ${numberFormat.format(stats.pendingTrash)} to delete`}
              variant="secondary"
              onPress={() => router.push('/trash')}
            />
          )}

          {!!lifetime?.bytes && (
            <ThemedText type="small" themeColor="textSecondary">
              {`${formatBytes(lifetime.bytes)} freed so far (${numberFormat.format(lifetime.items)} items)`}
            </ThemedText>
          )}

          {limited && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">You’ve shared only some photos</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Gallery Wipe can only clean up what it can see. Share more of your library to
                review everything.
              </ThemedText>
              <Button title="Manage access" variant="secondary" onPress={onManageAccess} />
            </ThemedView>
          )}

          <ThemedView style={styles.grid}>
            <Stat label="Items" value={stats?.total} />
            <Stat label="Photos" value={stats?.photos} />
            <Stat label="Videos" value={stats?.videos} />
            <Stat label="Screenshots" value={stats?.screenshots} />
            <Stat label="Albums" value={stats?.albums} />
            <Stat label="Reviewed" value={stats?.reviewed} />
            <Stat label="Marked to delete" value={stats?.pendingTrash} />
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            {scanning
              ? `Indexing library… ${numberFormat.format(scanned)} items`
              : error
                ? `Indexing failed: ${error}`
                : lastScan
                  ? `Indexed ${numberFormat.format(lastScan.count)} items in ${formatSeconds(lastScan.assetsMs)} (albums ${formatSeconds(lastScan.durationMs - lastScan.assetsMs)})`
                  : null}
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="subtitle">{value === undefined ? '–' : numberFormat.format(value)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
