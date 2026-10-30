import { useLayoutEffect, type Ref } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { Decision, DeckItem } from '@/db/decisions';
import { SwipeCard, type SwipeCardHandle } from '@/features/deck/swipe-card';

// Only this many cards are mounted; the ones behind the top card also warm the image loader.
const VISIBLE_CARDS = 3;

type SwipeDeckProps = {
  queue: DeckItem[];
  restored: { id: string; decision: Decision } | null;
  focused: boolean;
  onSwiped: (item: DeckItem, decision: Decision) => void;
  onOpen: (item: DeckItem) => void;
  onBroken: (item: DeckItem) => void;
  topCardRef: Ref<SwipeCardHandle>;
};

export function SwipeDeck({ queue, restored, focused, onSwiped, onOpen, onBroken, topCardRef }: SwipeDeckProps) {
  const progress = useSharedValue(0);
  const topId = queue[0]?.id;

  // A new top card starts at rest; reset before paint so the cards behind don't jump.
  useLayoutEffect(() => {
    progress.set(0);
  }, [topId, progress]);

  if (queue.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const visible = queue.slice(0, VISIBLE_CARDS);
  return (
    <View style={styles.deck}>
      {visible
        .map((item, index) => (
          <SwipeCard
            key={item.id}
            ref={index === 0 ? topCardRef : undefined}
            item={item}
            index={index}
            progress={progress}
            focused={focused}
            enterFrom={restored?.id === item.id ? restored.decision : undefined}
            onSwiped={onSwiped}
            onOpen={onOpen}
            onBroken={onBroken}
          />
        ))
        .reverse()}
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
