import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Decision, DeckItem } from '@/db/decisions';
import { VideoLayer } from '@/features/deck/video-layer';
import { useTheme } from '@/hooks/use-theme';

const VELOCITY_THRESHOLD = 800;
const FLY_OUT_MS = 220;
const MAX_ROTATION_DEG = 12;
const SPRING = { damping: 18, stiffness: 180 };

export type SwipeCardHandle = {
  swipe: (decision: Decision) => void;
};

type SwipeCardProps = {
  item: DeckItem;
  // 0 is the interactive top card; 1 and 2 sit behind it.
  index: number;
  // 0 → 1 as the top card approaches a decision; drives the cards behind it.
  progress: SharedValue<number>;
  // False while another screen covers the deck, so videos stop playing.
  focused: boolean;
  // Set when this card was just undone, so it flies back in from where it left.
  enterFrom?: Decision;
  onSwiped: (item: DeckItem, decision: Decision) => void;
  onOpen: (item: DeckItem) => void;
  ref?: Ref<SwipeCardHandle>;
};

export function SwipeCard({ item, index, progress, focused, enterFrom, onSwiped, onOpen, ref }: SwipeCardProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const thresholdX = width * 0.3;
  const thresholdY = height * 0.15;
  const [showInfo, setShowInfo] = useState(false);
  const isVideo = item.mediaType === 'video';

  const translateX = useSharedValue(enterFrom === 'keep' ? width * 1.5 : enterFrom === 'trash' ? -width * 1.5 : 0);
  const translateY = useSharedValue(enterFrom === 'skip' ? -height : 0);
  const leaving = useSharedValue(false);
  const armed = useSharedValue(false);

  useEffect(() => {
    if (!enterFrom) return;
    translateX.set(withSpring(0, SPRING));
    translateY.set(withSpring(0, SPRING));
  }, [enterFrom, translateX, translateY]);

  function flyOut(decision: Decision) {
    'worklet';
    if (leaving.get()) return;
    leaving.set(true);
    progress.set(withTiming(1, { duration: FLY_OUT_MS }));
    const onDone = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onSwiped, item, decision);
    };
    if (decision === 'skip') {
      translateY.set(withTiming(-height * 1.2, { duration: FLY_OUT_MS }, onDone));
    } else {
      const direction = decision === 'keep' ? 1 : -1;
      translateX.set(withTiming(direction * width * 1.5, { duration: FLY_OUT_MS }, onDone));
      translateY.set(withTiming(translateY.get() + 40, { duration: FLY_OUT_MS }));
    }
  }

  useImperativeHandle(ref, () => ({ swipe: (decision) => flyOut(decision) }));

  const pan = usePanGesture({
    enabled: index === 0,
    onUpdate: (event) => {
      'worklet';
      if (leaving.get()) return;
      translateX.set(event.translationX);
      translateY.set(event.translationY);
      const reach = Math.max(Math.abs(event.translationX) / thresholdX, -event.translationY / thresholdY);
      progress.set(Math.min(1, Math.max(0, reach)));
      const isArmed = reach >= 1;
      if (isArmed !== armed.get()) {
        armed.set(isArmed);
        if (isArmed) scheduleOnRN(Haptics.selectionAsync);
      }
    },
    onDeactivate: (event) => {
      'worklet';
      if (leaving.get()) return;
      const { translationX: x, translationY: y, velocityX: vx, velocityY: vy } = event;
      if (x > thresholdX || (vx > VELOCITY_THRESHOLD && x > 0)) {
        flyOut('keep');
      } else if (x < -thresholdX || (vx < -VELOCITY_THRESHOLD && x < 0)) {
        flyOut('trash');
      } else if (y < -thresholdY || (vy < -VELOCITY_THRESHOLD && y < 0)) {
        flyOut('skip');
      } else {
        armed.set(false);
        translateX.set(withSpring(0, SPRING));
        translateY.set(withSpring(0, SPRING));
        progress.set(withSpring(0, SPRING));
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => {
    if (index === 0) {
      const rotate = interpolate(translateX.get(), [-width, 0, width], [-MAX_ROTATION_DEG, 0, MAX_ROTATION_DEG]);
      return {
        transform: [
          { translateX: translateX.get() },
          { translateY: translateY.get() },
          { rotate: `${rotate}deg` },
        ],
      };
    }
    const from = index === 1 ? [0.95, 14] : [0.9, 28];
    const to = index === 1 ? [1, 0] : [0.95, 14];
    return {
      transform: [
        { translateY: interpolate(progress.get(), [0, 1], [from[1], to[1]]) },
        { scale: interpolate(progress.get(), [0, 1], [from[0], to[0]]) },
      ],
    };
  });

  const keepStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [0, thresholdX], [0, 1], Extrapolation.CLAMP),
  }));
  const trashStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [-thresholdX, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const skipStampStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(translateY.get(), [-thresholdY, 0], [1, 0], Extrapolation.CLAMP) *
      interpolate(Math.abs(translateX.get()), [0, thresholdX], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.card, { backgroundColor: theme.backgroundElement }, cardStyle]}
        pointerEvents={index === 0 ? 'auto' : 'none'}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${isVideo ? `Video, ${formatDuration(item.duration)}` : 'Photo'}, from ${formatDate(item.creationTime)}`}
          accessibilityHint="Opens it full screen. Long press for details."
          onPress={() => onOpen(item)}
          onLongPress={() => setShowInfo((value) => !value)}>
          <Image
            source={{ uri: item.id }}
            recyclingKey={item.id}
            cachePolicy="memory"
            contentFit="cover"
            transition={120}
            style={StyleSheet.absoluteFill}
          />
          {isVideo && (
            <VideoLayer
              uri={item.id}
              active={index === 0 && focused}
              showSurface={index <= 1}
              cardPan={pan}
            />
          )}
          <View style={styles.footer} pointerEvents="none">
            <ThemedText type="smallBold" style={styles.onPhoto}>
              {isVideo ? `${formatDate(item.creationTime)} · ${formatDuration(item.duration)}` : formatDate(item.creationTime)}
            </ThemedText>
            {showInfo && (
              <ThemedText type="small" style={styles.onPhoto}>
                {[item.filename, item.width && item.height ? `${item.width} × ${item.height}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            )}
          </View>
        </Pressable>

        <Animated.View style={[styles.stamp, styles.stampLeft, { borderColor: theme.success }, keepStampStyle]}>
          <ThemedText type="smallBold" style={{ color: theme.success }}>
            KEEP
          </ThemedText>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampRight, { borderColor: theme.danger }, trashStampStyle]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            DELETE
          </ThemedText>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampBottom, { borderColor: theme.text }, skipStampStyle]}>
          <ThemedText type="smallBold">LATER</ThemedText>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatDate(ms: number | null) {
  return ms ? dateFormat.format(ms) : 'Unknown date';
}

function formatDuration(ms: number | null) {
  if (!ms) return '0:00';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: Spacing.four,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: Spacing.half,
    padding: Spacing.three,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  onPhoto: {
    color: '#ffffff',
  },
  stamp: {
    position: 'absolute',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderWidth: 3,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  stampLeft: {
    top: Spacing.six,
    left: Spacing.four,
    transform: [{ rotate: '-12deg' }],
  },
  stampRight: {
    top: Spacing.six,
    right: Spacing.four,
    transform: [{ rotate: '12deg' }],
  },
  stampBottom: {
    bottom: Spacing.six + Spacing.four,
    alignSelf: 'center',
  },
});
