import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getLibraryPage, type LibraryItem } from '@/db/library';
import { buildDeckQuery, NO_SESSION } from '@/features/filters/query';
import { DEFAULT_FILTERS, type MediaFilter, type SortKey } from '@/features/filters/spec';
import { requestScan, useIndexStatus } from '@/features/media/indexer';
import { haptic } from '@/features/preferences';
import { confirmDeletion, deleteAssets } from '@/features/trash/delete-assets';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, numberFormat } from '@/utils/format';

const COLUMNS = 3;
const GAP = 2;
const PAGE_SIZE = 120;

const MEDIA_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Photos' },
  { value: 'video', label: 'Videos' },
] as const;
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'largest', label: 'Largest' },
] as const;

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [mediaType, setMediaType] = useState<MediaFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [endReached, setEndReached] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const loadingMore = useRef(false);

  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  // Everything in the library, whatever its decision; favorites included.
  const query = buildDeckQuery(
    { ...DEFAULT_FILTERS, mediaType, sort, review: 'any', includeFavorites: true },
    NO_SESSION
  );
  const queryKey = JSON.stringify(query);

  const reload = useCallback(async () => {
    const page = await getLibraryPage(db, JSON.parse(queryKey), 0, PAGE_SIZE);
    setItems(page);
    setEndReached(page.length < PAGE_SIZE);
  }, [db, queryKey]);

  // After every scan (items added or removed elsewhere).
  useEffect(
    () =>
      useIndexStatus.subscribe((state, previous) => {
        if (state.version !== previous.version) reload();
      }),
    [reload]
  );
  // On focus, filter change and mount; decisions made elsewhere change the badges.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function loadMore() {
    if (endReached || loadingMore.current) return;
    loadingMore.current = true;
    const page = await getLibraryPage(db, query, items.length, PAGE_SIZE);
    setItems((current) => [...current, ...page]);
    setEndReached(page.length < PAGE_SIZE);
    loadingMore.current = false;
  }

  function toggle(id: string) {
    haptic.selection();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function endSelection() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function onDelete() {
    const ids = [...selected];
    if (!(await confirmDeletion(ids.length))) return;
    setDeleting(true);
    const result = await deleteAssets(db, ids);
    setDeleting(false);
    if (result.deleted === 0) {
      haptic.warning();
      return;
    }
    endSelection();
    await requestScan(db);
    router.push({
      pathname: '/summary',
      params: { deleted: String(result.deleted), bytes: String(result.bytesFreed), remaining: '0' },
    });
  }

  const selectedBytes = items.reduce((sum, item) => sum + (selected.has(item.id) ? (item.size ?? 0) : 0), 0);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ThemedText type="subtitle">Library</ThemedText>
            <Button
              title={selecting ? 'Cancel' : 'Select'}
              variant="secondary"
              onPress={selecting ? endSelection : () => setSelecting(true)}
            />
          </View>
          <ChipGroup options={MEDIA_OPTIONS} value={mediaType} onChange={setMediaType} />
          <ChipGroup options={SORT_OPTIONS} value={sort} onChange={setSort} />
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          extraData={selected}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP, paddingBottom: BottomTabInset + Spacing.six * 2 }}
          getItemLayout={(_, index) => ({
            length: tile + GAP,
            offset: (tile + GAP) * Math.floor(index / COLUMNS),
            index,
          })}
          onEndReached={loadMore}
          onEndReachedThreshold={1.5}
          removeClippedSubviews
          windowSize={7}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              Nothing here.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Tile
              item={item}
              size={tile}
              selecting={selecting}
              selected={selected.has(item.id)}
              showSize={sort === 'largest'}
              onPress={() =>
                selecting
                  ? toggle(item.id)
                  : router.push({ pathname: '/viewer/[id]', params: { id: item.id, mediaType: item.mediaType } })
              }
              onLongPress={() => {
                setSelecting(true);
                toggle(item.id);
              }}
            />
          )}
        />

        {selecting && selected.size > 0 && (
          <View
            style={[
              styles.actionBar,
              { backgroundColor: theme.backgroundElement, bottom: BottomTabInset + Spacing.three },
            ]}>
            <ThemedText type="smallBold" style={styles.actionText}>
              {`${numberFormat.format(selected.size)} selected${selectedBytes ? ` · ${formatBytes(selectedBytes)}` : ''}`}
            </ThemedText>
            <Button title={deleting ? 'Deleting…' : 'Delete'} variant="danger" disabled={deleting} onPress={onDelete} />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

type TileProps = {
  item: LibraryItem;
  size: number;
  selecting: boolean;
  selected: boolean;
  showSize: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

function Tile({ item, size, selecting, selected, showSize, onPress, onLongPress }: TileProps) {
  const theme = useTheme();
  const [broken, setBroken] = useState(false);
  const isVideo = item.mediaType === 'video';
  const label = [
    isVideo ? 'Video' : 'Photo',
    broken ? 'could not be loaded' : null,
    item.decision === 'keep' ? 'kept' : item.decision === 'trash' ? 'marked to delete' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole={selecting ? 'checkbox' : 'imagebutton'}
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width: size, height: size, backgroundColor: theme.backgroundElement }}>
      <Image
        source={{ uri: item.id }}
        recyclingKey={item.id}
        cachePolicy="memory"
        contentFit="cover"
        onError={() => setBroken(true)}
        style={StyleSheet.absoluteFill}
      />
      {broken && (
        <View style={styles.brokenTile} pointerEvents="none">
          <SymbolView
            name={{ ios: 'exclamationmark.triangle', android: 'broken_image' }}
            size={20}
            tintColor={theme.textSecondary}
          />
        </View>
      )}
      <View style={styles.badges} pointerEvents="none">
        {item.decision === 'keep' && (
          <SymbolView name={{ ios: 'heart.fill', android: 'favorite' }} size={14} tintColor="#ffffff" />
        )}
        {item.decision === 'trash' && (
          <SymbolView name={{ ios: 'trash.fill', android: 'delete' }} size={14} tintColor={theme.danger} />
        )}
        <View style={styles.spacer} />
        {showSize && item.size !== null ? (
          <ThemedText type="small" style={styles.badgeText}>
            {formatBytes(item.size)}
          </ThemedText>
        ) : isVideo ? (
          <ThemedText type="small" style={styles.badgeText}>
            {formatDuration(item.duration)}
          </ThemedText>
        ) : null}
      </View>
      {selecting && (
        <View style={[styles.selectOverlay, selected && styles.selectedOverlay]} pointerEvents="none">
          <SymbolView
            name={selected ? { ios: 'checkmark.circle.fill', android: 'check_circle' } : { ios: 'circle', android: 'radio_button_unchecked' }}
            size={22}
            tintColor="#ffffff"
          />
        </View>
      )}
    </Pressable>
  );
}

function formatDuration(ms: number | null) {
  const total = Math.round((ms ?? 0) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
  badges: {
    position: 'absolute',
    left: Spacing.one,
    right: Spacing.one,
    bottom: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  brokenTile: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    flex: 1,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 3,
  },
  selectOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-end',
    padding: Spacing.one,
  },
  selectedOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  actionBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  actionText: {
    flex: 1,
  },
});
