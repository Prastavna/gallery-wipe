import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Decision, DeckItem } from '@/db/decisions';
import type { SwipeCardHandle } from '@/features/deck/swipe-card';
import { SwipeDeck } from '@/features/deck/swipe-deck';
import { useDeck } from '@/features/deck/use-deck';
import { useTheme } from '@/hooks/use-theme';

const numberFormat = new Intl.NumberFormat();

export default function SwipeScreen() {
  const theme = useTheme();
  const deck = useDeck();
  const topCard = useRef<SwipeCardHandle>(null);

  function onSwiped(item: DeckItem, decision: Decision) {
    Haptics.impactAsync(decision === 'trash' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    deck.decide(item, decision);
  }

  function onOpen(item: DeckItem) {
    router.push({ pathname: '/viewer/[id]', params: { id: item.id } });
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
          <ThemedText type="smallBold">
            {deck.status === 'ready' ? `${numberFormat.format(deck.remaining)} left` : ''}
          </ThemedText>
          <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
            <SymbolView name={{ ios: 'trash', android: 'delete' }} size={14} tintColor={theme.danger} />
            <ThemedText type="smallBold">{numberFormat.format(deck.counts.trash)}</ThemedText>
          </View>
        </View>

        <View style={styles.deckArea}>
          {deck.status === 'loading' ? (
            <ActivityIndicator style={styles.fill} />
          ) : deck.status === 'done' ? (
            <View style={[styles.fill, styles.done]}>
              <ThemedText type="subtitle">All caught up</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                {`Kept ${deck.counts.keep}, marked ${deck.counts.trash} to delete and saved ${deck.counts.skip} for later.`}
              </ThemedText>
              <Button title="Done" onPress={() => router.back()} />
            </View>
          ) : (
            <SwipeDeck
              queue={deck.queue}
              restored={deck.restored}
              onSwiped={onSwiped}
              onOpen={onOpen}
              topCardRef={topCard}
            />
          )}
        </View>

        <View style={styles.actions}>
          <IconButton
            label="Undo"
            name={{ ios: 'arrow.uturn.backward', android: 'undo' }}
            disabled={!deck.canUndo}
            onPress={deck.undo}
          />
          <IconButton
            label="Delete"
            large
            color={theme.danger}
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
            color={theme.success}
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
  color?: string;
  large?: boolean;
  disabled?: boolean;
};

function IconButton({ label, name, onPress, color, large, disabled }: IconButtonProps) {
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
          backgroundColor: theme.backgroundElement,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}>
      <SymbolView name={name} size={large ? 30 : 22} tintColor={color ?? theme.text} />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
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
