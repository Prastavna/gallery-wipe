import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { clearDecisions, countDecisions, type Decision } from '@/db/decisions';
import { getLifetime, type Lifetime } from '@/db/trash';
import { requestScan, useIndexStatus } from '@/features/media/indexer';
import { useMediaPermission } from '@/features/media/permissions';
import { formatBytes, numberFormat } from '@/utils/format';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const access = useMediaPermission((state) => state.response?.accessPrivileges);
  const manageLimitedAccess = useMediaPermission((state) => state.manageLimitedAccess);
  const { scanning, scanned, lastScan, error } = useIndexStatus();
  const [counts, setCounts] = useState<Record<Decision, number> | null>(null);
  const [lifetime, setLifetime] = useState<Lifetime | null>(null);

  const refresh = useCallback(() => {
    countDecisions(db).then(setCounts);
    getLifetime(db).then(setLifetime);
  }, [db]);
  useFocusEffect(refresh);

  function confirmClear(decision: Decision, title: string, message: string, action: string) {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: async () => {
          await clearDecisions(db, decision);
          refresh();
        },
      },
    ]);
  }

  async function onManageAccess() {
    await manageLimitedAccess();
    await requestScan(db);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Settings</ThemedText>

          <Section title="Your decisions">
            <Row
              label="Kept"
              detail={`${numberFormat.format(counts?.keep ?? 0)} items never shown again`}
              action={
                <Button
                  title="Reset"
                  variant="secondary"
                  disabled={!counts?.keep}
                  onPress={() =>
                    confirmClear(
                      'keep',
                      'Reset kept items?',
                      'Everything you chose to keep will show up in your decks again.',
                      'Reset'
                    )
                  }
                />
              }
            />
            <Row
              label="Saved for later"
              detail={`${numberFormat.format(counts?.skip ?? 0)} items`}
              action={
                <Button
                  title="Reset"
                  variant="secondary"
                  disabled={!counts?.skip}
                  onPress={() =>
                    confirmClear('skip', 'Reset saved for later?', 'These items will count as not reviewed.', 'Reset')
                  }
                />
              }
            />
            <Row
              label="Marked to delete"
              detail={`${numberFormat.format(counts?.trash ?? 0)} items waiting in Trash`}
              action={
                <Button
                  title="Empty"
                  variant="secondary"
                  disabled={!counts?.trash}
                  onPress={() =>
                    confirmClear(
                      'trash',
                      'Empty Trash without deleting?',
                      'Nothing is deleted from your device. The items go back to not reviewed.',
                      'Empty'
                    )
                  }
                />
              }
            />
          </Section>

          <Section title="Library access">
            <Row
              label={access === 'limited' ? 'Selected photos only' : 'Full library'}
              detail={
                access === 'limited'
                  ? 'Gallery Wipe can only clean up the photos you shared.'
                  : 'Gallery Wipe can see your whole library.'
              }
            />
            <View style={styles.buttons}>
              {access === 'limited' && (
                <Button title="Choose photos" variant="secondary" onPress={onManageAccess} style={styles.flex} />
              )}
              <Button title="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} style={styles.flex} />
            </View>
          </Section>

          <Section title="Library index">
            <Row
              label={scanning ? 'Indexing…' : error ? 'Last scan failed' : 'Up to date'}
              detail={
                scanning
                  ? `${numberFormat.format(scanned)} items so far`
                  : error
                    ? error
                    : lastScan
                      ? `${numberFormat.format(lastScan.count)} items in ${seconds(lastScan.assetsMs)}, albums in ${seconds(lastScan.durationMs - lastScan.assetsMs)}`
                      : 'Not scanned yet'
              }
              action={<Button title="Rescan" variant="secondary" disabled={scanning} onPress={() => requestScan(db)} />}
            />
          </Section>

          <Section title="About">
            {!!lifetime?.bytes && (
              <Row
                label={`${formatBytes(lifetime.bytes)} freed`}
                detail={`${numberFormat.format(lifetime.items)} items deleted with Gallery Wipe`}
              />
            )}
            <Row
              label="Private by design"
              detail="Your photos never leave your device. Gallery Wipe has no account and no servers."
            />
            <ThemedText type="small" themeColor="textSecondary">
              {`Version ${Constants.expoConfig?.version ?? '–'}`}
            </ThemedText>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {children}
      </ThemedView>
    </View>
  );
}

function Row({ label, detail, action }: { label: string; detail?: string; action?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <ThemedText>{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function seconds(ms: number) {
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
  section: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});
