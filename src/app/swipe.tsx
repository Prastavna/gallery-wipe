import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Decision, DeckItem } from '@/db/decisions';
import type { SwipeCardHandle } from '@/features/deck/swipe-card';
import { SwipeDeck } from '@/features/deck/swipe-deck';
import { useDeck } from '@/features/deck/use-deck';
import { describeFilters, type FilterSpec } from '@/features/filters/spec';
import { useFilters } from '@/features/filters/store';
import { requestScan } from '@/features/media/indexer';
import { haptic } from '@/features/preferences';
import { useTheme } from '@/hooks/use-theme';
import { formatBytes, numberFormat } from '@/utils/format';

// Offer to review and delete before the pile gets unwieldy: every this many items or bytes.
const REVIEW_PROMPT_EVERY_ITEMS = 50;
const REVIEW_PROMPT_EVERY_BYTES = 1_000_000_000;

const ANNOUNCEMENTS: Record<Decision, string> = {
  keep: 'Kept',
  trash: 'Marked to delete',
  skip: 'Saved for later',
};

export default function SwipeScreen() {
  const spec = useFilters((state) => state.spec);
  // A deck keeps its filters for the whole session, so applying new ones starts a fresh session.
  return <SwipeSession key={JSON.stringify(spec)} spec={spec} />;
}

function SwipeSession({ spec }: { spec: FilterSpec }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const deck = useDeck(spec);
  const topCard = useRef<SwipeCardHandle>(null);
  const focused = useIsFocused();
  const { prune } = deck;

  // Coming back from Trash: some cards may have just been deleted.
  useFocusEffect(useCallback(() => prune(), [prune]));

  function onSwiped(item: DeckItem, decision: Decision) {
    if (decision === 'trash') haptic.medium();
    else haptic.light();
    AccessibilityInfo.announceForAccessibility(ANNOUNCEMENTS[decision]);
    deck.decide(item, decision);
    if (decision !== 'trash') return;
    const trashed = deck.counts.trash + 1;
    const bytes = deck.trashBytes + (item.size ?? 0);
    const crossedBytes =
      Math.floor(bytes / REVIEW_PROMPT_EVERY_BYTES) > Math.floor(deck.trashBytes / REVIEW_PROMPT_EVERY_BYTES);
    if (trashed % REVIEW_PROMPT_EVERY_ITEMS === 0 || crossedBytes) {
      const title = crossedBytes ? `${formatBytes(bytes)} marked` : `${trashed} items marked`;
      Alert.alert(title, 'Review and delete them now, or keep going?', [
        { text: 'Keep swiping', style: 'cancel' },
        { text: 'Review', onPress: () => router.push('/trash') },
      ]);
    }
  }

  function onUndo() {
    deck.undo();
    AccessibilityInfo.announceForAccessibility('Undone');
  }

  // A file that will not load was probably deleted outside the app; a rescan drops it from the index.
  function onBroken() {
    requestScan(db);
  }

  function onOpen(item: DeckItem) {
    router.push({ pathname: '/viewer/[id]', params: { id: item.id, mediaType: item.mediaType } });
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <IconButton
            label="Close"
            name={{ ios: 'xmark', android: 'close' }}
            onPress={() => router.back()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Filters: ${describeFilters(deck.spec)}`}
            accessibilityHint="Changing filters starts a new deck."
            onPress={() => router.push('/filters')}
            style={({ pressed }) => [styles.headerTitle, { opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText type="heading">
              {deck.status === 'ready' ? `${numberFormat.format(deck.remaining)} left` : ' '}
            </ThemedText>
            <View style={styles.filterLine}>
              <SymbolView
                name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list' }}
                size={14}
                tintColor={theme.textSecondary}
              />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.filterText}>
                {describeFilters(deck.spec)}
              </ThemedText>
              <SymbolView
                name={{ ios: 'chevron.down', android: 'expand_more' }}
                size={12}
                tintColor={theme.textSecondary}
              />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Review ${deck.counts.trash} marked to delete`}
            onPress={() => router.push('/trash')}
            style={[styles.pill, { borderColor: theme.line }]}>
            <SymbolView name={{ ios: 'trash', android: 'delete' }} size={14} tintColor={theme.danger} />
            <ThemedText type="smallBold">
              {deck.trashBytes > 0
                ? `${numberFormat.format(deck.counts.trash)} · ${formatBytes(deck.trashBytes)}`
                : numberFormat.format(deck.counts.trash)}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.deckArea}>
          {deck.status === 'loading' ? (
            <ActivityIndicator style={styles.fill} />
          ) : deck.status === 'empty' ? (
            <View style={[styles.fill, styles.done]}>
              <ThemedText type="subtitle" style={styles.centerText}>
                Nothing matches
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                {`No items fit “${describeFilters(deck.spec)}”.`}
              </ThemedText>
              <Button title="Change filters" onPress={() => router.push('/filters')} style={styles.doneButton} />
            </View>
          ) : deck.status === 'done' ? (
            <View style={[styles.fill, styles.done]}>
              <ThemedText type="subtitle">All caught up</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                {`Kept ${deck.counts.keep}, marked ${deck.counts.trash} to delete and saved ${deck.counts.skip} for later.`}
              </ThemedText>
              <Button title="Done" onPress={() => router.back()} style={styles.doneButton} />
            </View>
          ) : (
            <SwipeDeck
              queue={deck.queue}
              restored={deck.restored}
              focused={focused}
              onSwiped={onSwiped}
              onOpen={onOpen}
              onBroken={onBroken}
              topCardRef={topCard}
            />
          )}
        </View>

        <View style={styles.actions}>
          <IconButton
            label="Undo"
            name={{ ios: 'arrow.uturn.backward', android: 'undo' }}
            disabled={!deck.canUndo}
            onPress={onUndo}
          />
          <IconButton
            label="Delete"
            large
            fill={theme.danger}
            name={{ ios: 'trash.fill', android: 'delete' }}
            disabled={deck.status !== 'ready'}
            onPress={() => topCard.current?.swipe('trash')}
          />
          <IconButton
            label="Decide later"
            name={{ ios: 'clock.arrow.circlepath', android: 'schedule' }}
            disabled={deck.status !== 'ready'}
            onPress={() => topCard.current?.swipe('skip')}
          />
          <IconButton
            label="Keep"
            large
            fill={theme.success}
            name={{ ios: 'heart.fill', android: 'favorite' }}
            disabled={deck.status !== 'ready'}
            onPress={() => topCard.current?.swipe('keep')}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

type IconButtonProps = {
  label: string;
  name: SymbolViewProps['name'];
  onPress: () => void;
  // The two decisions that matter get a solid marker color; the rest stay quiet.
  fill?: string;
  large?: boolean;
  disabled?: boolean;
};

function IconButton({ label, name, onPress, fill, large, disabled }: IconButtonProps) {
  const theme = useTheme();
  const size = large ? 72 : 52;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          backgroundColor: fill ?? theme.backgroundElement,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
          transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
        },
      ]}>
      <SymbolView name={name} size={large ? 30 : 22} tintColor={fill ? theme.background : theme.text} />
    </Pressable>
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  filterLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    maxWidth: '100%',
  },
  filterText: {
    flexShrink: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderWidth: 1,
    borderRadius: Spacing.four,
  },
  deckArea: {
    flex: 1,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.five,
  },
  fill: {
    flex: 1,
  },
  done: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  doneButton: {
    alignSelf: 'stretch',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingBottom: Spacing.three,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
});
