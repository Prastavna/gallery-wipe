import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { getLibraryStats, type LibraryStats } from '@/db/assets';
import { countDeckItems, getDeckItems, type DeckItem } from '@/db/decisions';
import { getDuplicateGroups, getSimilarGroups, type MediaGroup } from '@/db/groups';
import { getLifetime, type Lifetime } from '@/db/trash';
import { buildDeckQuery, NO_SESSION } from '@/features/filters/query';
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  describeFilters,
  isDefaultFilters,
  PRESETS,
  type FilterSpec,
} from '@/features/filters/spec';
import { useFilters } from '@/features/filters/store';
import { requestScan, useIndexStatus } from '@/features/media/indexer';
import { useMediaPermission } from '@/features/media/permissions';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, numberFormat } from '@/utils/format';

const PREVIEW_CARDS = 3;
const STACK_HEIGHT = 280;
// Back to front: how the cards behind the next photo fan out.
const FAN = [
  { rotate: '-7deg', translateX: -18, translateY: 10 },
  { rotate: '5deg', translateX: 16, translateY: 6 },
  { rotate: '0deg', translateX: 0, translateY: 0 },
];

type Deck = { items: DeckItem[]; count: number };

export default function HomeScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { scanning, scanned, error, version } = useIndexStatus();
  const limited = useMediaPermission((state) => state.response?.accessPrivileges === 'limited');
  const manageLimitedAccess = useMediaPermission((state) => state.manageLimitedAccess);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [lifetime, setLifetime] = useState<Lifetime | null>(null);
  const [groups, setGroups] = useState<{ duplicates: MediaGroup[]; similar: MediaGroup[] } | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const filters = useFilters((state) => state.spec);
  const applyFilters = useFilters((state) => state.apply);

  const refreshStats = useCallback(() => {
    getLibraryStats(db).then(setStats);
    getLifetime(db).then(setLifetime);
    Promise.all([getDuplicateGroups(db), getSimilarGroups(db)]).then(([duplicates, similar]) =>
      setGroups({ duplicates, similar })
    );
    // A preview of what Start cleaning will show; a random deck reshuffles when it opens.
    const query = buildDeckQuery(filters, NO_SESSION);
    Promise.all([getDeckItems(db, query, [], PREVIEW_CARDS), countDeckItems(db, query)]).then(([items, count]) =>
      setDeck({ items, count: filters.limit ? Math.min(count, filters.limit) : count })
    );
  }, [db, filters]);
  // On focus, so counts reflect decisions made in the swipe deck; and after each scan.
  useFocusEffect(refreshStats);
  useEffect(() => {
    if (version > 0) refreshStats();
  }, [version, refreshStats]);

  async function startPreset(spec: FilterSpec) {
    await applyFilters(db, spec);
    router.push('/swipe');
  }

  async function onManageAccess() {
    await manageLimitedAccess();
    await requestScan(db);
  }

  const libraryEmpty = !stats || stats.total === 0;
  const activeFilters = countActiveFilters(filters);
  const groupCount = groups ? groups.duplicates.length + groups.similar.length : 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle" accessibilityRole="header">
            Gallery Wipe
          </ThemedText>

          <View style={styles.hero}>
            <PhotoStack items={deck?.items ?? []} onPress={() => router.push('/swipe')} />
            <View style={styles.deckLine}>
              <ThemedText type="heading" style={styles.flex}>
                {deck === null
                  ? ' '
                  : deck.count === 0
                    ? 'Nothing left to review'
                    : `${numberFormat.format(deck.count)} to review`}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Filters: ${describeFilters(filters)}`}
                hitSlop={8}
                onPress={() => router.push('/filters')}
                style={({ pressed }) => [styles.filterButton, { borderColor: theme.line, opacity: pressed ? 0.6 : 1 }]}>
                <SymbolView
                  name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list' }}
                  size={16}
                  tintColor={theme.text}
                />
                <ThemedText type="smallBold">{activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}</ThemedText>
              </Pressable>
            </View>
            <View style={styles.filterSummary}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.flex}>
                {describeFilters(filters)}
              </ThemedText>
              {!isDefaultFilters(filters) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear filters"
                  hitSlop={8}
                  onPress={() => applyFilters(db, DEFAULT_FILTERS)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <ThemedText type="smallBold">Clear</ThemedText>
                </Pressable>
              )}
            </View>
            <Button
              title="Start cleaning"
              disabled={libraryEmpty || deck?.count === 0}
              onPress={() => router.push('/swipe')}
            />
          </View>

          {!!stats?.pendingTrash && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${numberFormat.format(stats.pendingTrash)} marked to delete. Review Trash`}
              onPress={() => router.push('/trash')}
              style={({ pressed }) => [styles.trashStrip, { borderColor: theme.danger, opacity: pressed ? 0.7 : 1 }]}>
              <SymbolView name={{ ios: 'trash.fill', android: 'delete' }} size={18} tintColor={theme.danger} />
              <ThemedText type="defaultBold" style={styles.flex}>
                {`${numberFormat.format(stats.pendingTrash)} marked to delete`}
              </ThemedText>
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                Review
              </ThemedText>
            </Pressable>
          )}

          {limited && (
            <ThemedView type="backgroundElement" style={styles.notice}>
              <ThemedText type="smallBold">You’ve shared only some photos</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Gallery Wipe can only clean up what it can see. Share more of your library to review everything.
              </ThemedText>
              <Button title="Manage access" variant="secondary" size="compact" onPress={onManageAccess} />
            </ThemedView>
          )}

          {stats?.total === 0 && !scanning && (
            <ThemedView type="backgroundElement" style={styles.notice}>
              <ThemedText type="smallBold">No photos or videos found</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {limited
                  ? 'You haven’t shared any photos with Gallery Wipe yet. Use Manage access above.'
                  : 'Your library looks empty. New photos and videos will show up here automatically.'}
              </ThemedText>
            </ThemedView>
          )}

          <View style={styles.section}>
            <ThemedText type="heading" accessibilityRole="header">
              Quick clean
            </ThemedText>
            <View>
              {PRESETS.map((preset, index) => (
                <ListRow
                  key={preset.key}
                  title={preset.title}
                  detail={preset.subtitle}
                  first={index === 0}
                  disabled={libraryEmpty}
                  onPress={() => startPreset(preset.spec)}
                />
              ))}
              {groupCount > 0 && groups && (
                <ListRow
                  title="Duplicates & similar shots"
                  detail={describeGroups(groups.duplicates, groups.similar)}
                  onPress={() => router.push('/groups')}
                />
              )}
            </View>
          </View>

          {stats && stats.total > 0 && <LibraryLedger stats={stats} lifetime={lifetime} />}

          {scanning && (
            <ThemedText type="small" themeColor="textSecondary">
              {`Indexing library… ${numberFormat.format(scanned)} items`}
            </ThemedText>
          )}
          {!!error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {`Indexing failed: ${error}. Try Rescan in Settings.`}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** The next few photos in the deck, fanned like prints on a table. */
function PhotoStack({ items, onPress }: { items: DeckItem[]; onPress: () => void }) {
  const theme = useTheme();
  if (items.length === 0) {
    return (
      <View style={[styles.stack, styles.stackEmpty, { borderColor: theme.line }]}>
        <SymbolView name={{ ios: 'photo.stack', android: 'photo_library' }} size={36} tintColor={theme.textSecondary} />
      </View>
    );
  }
  // Rendered back to front so the next photo sits on top.
  const cards = items.slice(0, PREVIEW_CARDS).reverse();
  const fan = FAN.slice(FAN.length - cards.length);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start cleaning"
      accessibilityHint="Opens the swipe deck with these photos first."
      onPress={onPress}
      style={({ pressed }) => [styles.stack, pressed && styles.stackPressed]}>
      {cards.map((item, index) => (
        <View
          key={item.id}
          style={[
            styles.print,
            { backgroundColor: theme.backgroundElement, borderColor: theme.background },
            {
              transform: [
                { translateX: fan[index].translateX },
                { translateY: fan[index].translateY },
                { rotate: fan[index].rotate },
              ],
            },
          ]}>
          <Image
            source={{ uri: item.id }}
            recyclingKey={item.id}
            cachePolicy="memory"
            contentFit="cover"
            style={StyleSheet.absoluteFill}
          />
        </View>
      ))}
    </Pressable>
  );
}

type ListRowProps = {
  title: string;
  detail: string;
  first?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ListRow({ title, detail, first, disabled, onPress }: ListRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        { borderTopColor: theme.line, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth },
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}>
      <View style={styles.flex}>
        <ThemedText type="defaultBold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

/** How far through the library you are, then the raw counts. */
function LibraryLedger({ stats, lifetime }: { stats: LibraryStats; lifetime: Lifetime | null }) {
  const theme = useTheme();
  const decided = Math.max(0, stats.reviewed - stats.pendingTrash);
  const unreviewed = Math.max(0, stats.total - stats.reviewed);
  const percent = Math.round((stats.reviewed / stats.total) * 100);
  const rows: [string, number][] = [
    ['Photos', stats.photos],
    ['Videos', stats.videos],
    ['Screenshots', stats.screenshots],
    ['Albums', stats.albums],
  ];

  return (
    <View style={styles.section}>
      <ThemedText type="heading" accessibilityRole="header">
        Your library
      </ThemedText>
      <View
        accessible
        accessibilityLabel={`${percent} percent reviewed. ${numberFormat.format(stats.reviewed)} of ${numberFormat.format(stats.total)} items.`}
        style={styles.ledgerProgress}>
        <ThemedText type="small" themeColor="textSecondary">
          {`${numberFormat.format(stats.reviewed)} of ${numberFormat.format(stats.total)} reviewed`}
        </ThemedText>
        <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
          <View style={{ flex: decided, backgroundColor: theme.text }} />
          <View style={{ flex: stats.pendingTrash, backgroundColor: theme.danger }} />
          <View style={{ flex: unreviewed }} />
        </View>
      </View>
      <View style={styles.ledger}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.ledgerCell}>
            <ThemedText type="heading">{numberFormat.format(value)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
          </View>
        ))}
      </View>
      {!!lifetime?.bytes && (
        <ThemedText type="small" themeColor="textSecondary">
          {`${formatBytes(lifetime.bytes)} freed so far, across ${numberFormat.format(lifetime.items)} items.`}
        </ThemedText>
      )}
    </View>
  );
}

function describeGroups(duplicates: MediaGroup[], similar: MediaGroup[]) {
  const parts = [];
  if (duplicates.length) parts.push(`${numberFormat.format(duplicates.length)} sets of duplicates`);
  if (similar.length) parts.push(`${numberFormat.format(similar.length)} bursts`);
  const bytes = [...duplicates, ...similar].reduce((sum, group) => sum + group.reclaimableBytes, 0);
  return `${parts.join(' and ')}${bytes ? `, up to ${formatBytes(bytes)}` : ''}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: Spacing.five,
    padding: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
  },
  hero: {
    gap: Spacing.two,
  },
  stack: {
    height: STACK_HEIGHT,
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
    marginHorizontal: Spacing.four,
  },
  stackEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: Radius.large,
  },
  stackPressed: {
    transform: [{ scale: 0.98 }],
  },
  print: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    borderWidth: 3,
    overflow: 'hidden',
  },
  deckLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  filterSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderWidth: 1,
    borderRadius: 18,
  },
  trashStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 56,
    borderLeftWidth: 3,
  },
  notice: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'flex-start',
  },
  section: {
    gap: Spacing.two,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 4,
  },
  ledgerProgress: {
    gap: Spacing.two,
  },
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  ledger: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
    marginTop: Spacing.two,
  },
  ledgerCell: {
    width: '50%',
  },
});
