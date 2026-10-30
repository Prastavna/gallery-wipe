import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ChipGroup } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { markForDeletion } from '@/db/decisions';
import { countUnmeasured } from '@/db/filter-options';
import { getDuplicateGroups, getSimilarGroups, type GroupKind, type MediaGroup } from '@/db/groups';
import { haptic } from '@/features/preferences';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, numberFormat } from '@/utils/format';

const THUMB = 96;

type Groups = Record<GroupKind, MediaGroup[]>;
// Per group: the members currently chosen for deletion.
type Choices = Record<string, Set<string>>;

function suggestedChoices(groups: MediaGroup[]): Choices {
  return Object.fromEntries(
    groups.map((group) => [
      group.key,
      new Set(group.members.filter((member) => member.id !== group.keeperId).map((member) => member.id)),
    ])
  );
}

async function fetchGroups(db: SQLiteDatabase) {
  const [duplicates, similar, pending] = await Promise.all([
    getDuplicateGroups(db),
    getSimilarGroups(db),
    countUnmeasured(db),
  ]);
  return { duplicates, similar, pending };
}

export default function GroupsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [kind, setKind] = useState<GroupKind>('duplicates');
  const [groups, setGroups] = useState<Groups | null>(null);
  const [choices, setChoices] = useState<Choices>({});
  const [unmeasured, setUnmeasured] = useState(0);
  const [moved, setMoved] = useState(0);

  const apply = useCallback(({ duplicates, similar, pending }: Awaited<ReturnType<typeof fetchGroups>>) => {
    setGroups({ duplicates, similar });
    setChoices({ ...suggestedChoices(duplicates), ...suggestedChoices(similar) });
    setUnmeasured(pending);
  }, []);
  const load = useCallback(async () => apply(await fetchGroups(db)), [db, apply]);

  // Once on mount, not on focus: coming back from the viewer must not reset the user's choices.
  useEffect(() => {
    fetchGroups(db).then(apply);
  }, [db, apply]);

  const visible = groups?.[kind] ?? [];
  const chosenIds = (list: MediaGroup[]) => list.flatMap((group) => [...(choices[group.key] ?? [])]);
  const chosenBytes = (list: MediaGroup[]) =>
    list.reduce(
      (sum, group) =>
        sum + group.members.reduce((acc, m) => acc + (choices[group.key]?.has(m.id) ? (m.size ?? 0) : 0), 0),
      0
    );

  function toggle(group: MediaGroup, id: string) {
    const current = choices[group.key] ?? new Set<string>();
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Always keep at least one item of a group.
    if (next.size >= group.members.length) {
      haptic.warning();
      return;
    }
    haptic.selection();
    setChoices({ ...choices, [group.key]: next });
  }

  async function moveToTrash(list: MediaGroup[]) {
    const ids = chosenIds(list);
    if (ids.length === 0) return;
    await markForDeletion(db, ids);
    haptic.success();
    setMoved((count) => count + ids.length);
    await load();
  }

  function onApplyAll() {
    const ids = chosenIds(visible);
    Alert.alert(
      `Move ${numberFormat.format(ids.length)} items to Trash?`,
      `One item from each of the ${numberFormat.format(visible.length)} groups is kept. Nothing is deleted until you confirm in Trash.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Move to Trash', onPress: () => moveToTrash(visible) },
      ]
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.flex}>
            Duplicates & similar
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={theme.text} />
          </Pressable>
        </View>

        <View style={styles.controls}>
          <ChipGroup
            options={[
              { value: 'duplicates', label: `Duplicates · ${groups ? numberFormat.format(groups.duplicates.length) : '–'}` },
              { value: 'similar', label: `Similar shots · ${groups ? numberFormat.format(groups.similar.length) : '–'}` },
            ]}
            value={kind}
            onChange={setKind}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {kind === 'duplicates'
              ? 'Exact copies of the same file. We keep the earliest copy (or your favorite).'
              : 'Photos taken within two seconds of each other. We keep the sharpest-looking one (or your favorite).'}{' '}
            Tap a photo to switch between keep and delete; long press to view it.
          </ThemedText>
          {moved > 0 && (
            <View style={styles.movedRow}>
              <ThemedText type="small" style={styles.flex}>
                {`${numberFormat.format(moved)} items moved to Trash.`}
              </ThemedText>
              <Button title="Review Trash" variant="secondary" onPress={() => router.push('/trash')} />
            </View>
          )}
        </View>

        {groups === null ? (
          <ActivityIndicator style={styles.flex} />
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              {kind === 'duplicates'
                ? unmeasured > 0
                  ? `No duplicates found yet. ${numberFormat.format(unmeasured)} items still need their size measured, so check back soon.`
                  : 'No duplicates found.'
                : 'No similar shots found.'}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(group) => group.key}
            extraData={choices}
            contentContainerStyle={styles.list}
            renderItem={({ item: group }) => (
              <GroupCard
                group={group}
                chosen={choices[group.key] ?? new Set()}
                onToggle={(id) => toggle(group, id)}
                onApply={() => moveToTrash([group])}
              />
            )}
          />
        )}

        {groups !== null && visible.length > 0 && (
          <View style={styles.footer}>
            <Button
              title={`Apply all · ${numberFormat.format(chosenIds(visible).length)} items${
                chosenBytes(visible) ? ` · ${formatBytes(chosenBytes(visible))}` : ''
              }`}
              variant="danger"
              disabled={chosenIds(visible).length === 0}
              onPress={onApplyAll}
            />
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

type GroupCardProps = {
  group: MediaGroup;
  chosen: Set<string>;
  onToggle: (id: string) => void;
  onApply: () => void;
};

function GroupCard({ group, chosen, onToggle, onApply }: GroupCardProps) {
  const theme = useTheme();
  const bytes = group.members.reduce((sum, member) => sum + (chosen.has(member.id) ? (member.size ?? 0) : 0), 0);
  const noun = group.kind === 'duplicates' ? 'copies' : 'similar shots';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        {`${group.members.length} ${noun}${group.members[0].creationTime ? ` · ${dateFormat.format(group.members[0].creationTime)}` : ''}`}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
        {group.members.map((member) => {
          const deleting = chosen.has(member.id);
          return (
            <Pressable
              key={member.id}
              accessibilityRole="button"
              accessibilityLabel={`${member.mediaType === 'video' ? 'Video' : 'Photo'}${member.size ? `, ${formatBytes(member.size)}` : ''}, ${deleting ? 'will be deleted' : 'will be kept'}`}
              accessibilityHint="Tap to switch between keep and delete. Long press to view."
              onPress={() => onToggle(member.id)}
              onLongPress={() =>
                router.push({ pathname: '/viewer/[id]', params: { id: member.id, mediaType: member.mediaType } })
              }
              style={[styles.thumb, { borderColor: deleting ? 'transparent' : theme.success }]}>
              <Image
                source={{ uri: member.id }}
                recyclingKey={member.id}
                cachePolicy="memory"
                contentFit="cover"
                style={[StyleSheet.absoluteFill, deleting && styles.dimmed]}
              />
              <View style={[styles.thumbBadge, { backgroundColor: deleting ? theme.danger : theme.success }]}>
                <SymbolView
                  name={deleting ? { ios: 'trash.fill', android: 'delete' } : { ios: 'checkmark', android: 'check' }}
                  size={12}
                  tintColor="#ffffff"
                />
              </View>
              {member.size !== null && (
                <ThemedText type="small" style={styles.thumbSize}>
                  {formatBytes(member.size)}
                </ThemedText>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      <Button
        title={`Delete ${chosen.size}${bytes ? ` · ${formatBytes(bytes)}` : ''}`}
        variant="secondary"
        disabled={chosen.size === 0}
        onPress={onApply}
      />
    </ThemedView>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  controls: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  movedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  list: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  thumbs: {
    gap: Spacing.two,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Spacing.two,
    borderWidth: 3,
    overflow: 'hidden',
  },
  dimmed: {
    opacity: 0.45,
  },
  thumbBadge: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  thumbSize: {
    position: 'absolute',
    left: Spacing.one,
    bottom: Spacing.half,
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 3,
  },
  footer: {
    padding: Spacing.three,
  },
});
