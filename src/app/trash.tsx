import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getTrashItems, restoreFromTrash, type TrashItem } from '@/db/trash';
import { requestScan } from '@/features/media/indexer';
import { fillMissingSizes } from '@/features/media/sizes';
import { deleteAssets, osConfirmsDeletion } from '@/features/trash/delete-assets';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, numberFormat } from '@/utils/format';

const COLUMNS = 3;
const GAP = 2;

const DELETION_NOTE =
  Platform.OS === 'ios'
    ? 'Deleted items move to Recently Deleted in Photos, where you can recover them for 30 days.'
    : 'Deleted items are removed from your device permanently.';

export default function TrashScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Drop anything deleted outside the app first, so we never ask the OS to delete a ghost.
      await requestScan(db);
      const loaded = await getTrashItems(db);
      if (cancelled) return;
      setItems(loaded);
      await fillMissingSizes(db, loaded.map((item) => item.id));
      if (!cancelled) setItems(await getTrashItems(db));
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const tile = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const totalBytes = items?.reduce((sum, item) => sum + (item.size ?? 0), 0) ?? 0;
  const unknownSizes = items?.filter((item) => item.size === null).length ?? 0;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onRestore() {
    const ids = [...selected];
    await restoreFromTrash(db, ids);
    setItems((current) => current?.filter((item) => !selected.has(item.id)) ?? null);
    setSelected(new Set());
  }

  async function runDelete() {
    if (!items) return;
    setDeleting(true);
    setNotice(null);
    const result = await deleteAssets(db, items.map((item) => item.id));
    setDeleting(false);
    requestScan(db);

    if (result.deleted === 0) {
      setNotice('Nothing was deleted. Your items are still here.');
      return;
    }
    router.replace({
      pathname: '/summary',
      params: {
        deleted: String(result.deleted),
        bytes: String(result.bytesFreed),
        remaining: String(items.length - result.deleted),
      },
    });
  }

  function onDelete() {
    if (osConfirmsDeletion()) {
      runDelete();
      return;
    }
    Alert.alert(
      `Delete ${numberFormat.format(items?.length ?? 0)} items?`,
      'They will be removed from your device permanently.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: runDelete },
      ]
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Trash</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={theme.text} />
          </Pressable>
        </View>

        {items === null ? (
          <ActivityIndicator style={styles.container} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary">Nothing marked for deletion.</ThemedText>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            numColumns={COLUMNS}
            columnWrapperStyle={{ gap: GAP }}
            contentContainerStyle={{ gap: GAP }}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={item.mediaType === 'video' ? 'Video' : 'Photo'}
                  onPress={() => toggle(item.id)}
                  style={{ width: tile, height: tile }}>
                  <Image
                    source={{ uri: item.id }}
                    recyclingKey={item.id}
                    cachePolicy="memory"
                    contentFit="cover"
                    style={StyleSheet.absoluteFill}
                  />
                  {isSelected && (
                    <View style={styles.selectedOverlay}>
                      <SymbolView
                        name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
                        size={24}
                        tintColor="#ffffff"
                      />
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        {items !== null && items.length > 0 && (
          <View style={styles.footer}>
            <ThemedText type="smallBold">
              {`${numberFormat.format(items.length)} items · ${formatBytes(totalBytes)}`}
              {unknownSizes > 0 ? ` + ${numberFormat.format(unknownSizes)} not measured` : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {selected.size > 0 ? 'Tap items to choose what to put back.' : DELETION_NOTE}
            </ThemedText>
            {notice && (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {notice}
              </ThemedText>
            )}
            {selected.size > 0 ? (
              <Button
                title={`Put back ${numberFormat.format(selected.size)}`}
                variant="secondary"
                onPress={onRestore}
              />
            ) : (
              <Button
                title={deleting ? 'Deleting…' : `Delete ${numberFormat.format(items.length)} items`}
                disabled={deleting}
                variant="danger"
                onPress={onDelete}
              />
            )}
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-end',
    padding: Spacing.one,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  footer: {
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
