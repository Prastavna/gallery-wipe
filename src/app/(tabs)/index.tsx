import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getLibraryStats, type LibraryStats } from '@/db/assets';
import { requestScan, useIndexStatus } from '@/features/media/indexer';
import { useMediaPermission } from '@/features/media/permissions';

const numberFormat = new Intl.NumberFormat();

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { scanning, scanned, lastScan, error, version } = useIndexStatus();
  const limited = useMediaPermission((state) => state.response?.accessPrivileges === 'limited');
  const manageLimitedAccess = useMediaPermission((state) => state.manageLimitedAccess);
  const [stats, setStats] = useState<LibraryStats | null>(null);

  useEffect(() => {
    getLibraryStats(db).then(setStats);
  }, [db, version]);

  async function onManageAccess() {
    await manageLimitedAccess();
    await requestScan(db);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Gallery Wipe</ThemedText>

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
