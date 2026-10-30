import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture, type PanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { create } from 'zustand';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const TIME_UPDATE_INTERVAL_S = 0.25;
// Screen reader increment/decrement on the scrub bar.
const ACCESSIBLE_SEEK_FRACTION = 0.1;

// Sound preference for deck previews; starts muted and lasts for the app session.
export const useVideoSound = create<{ muted: boolean; toggle: () => void }>((set) => ({
  muted: true,
  toggle: () => set((state) => ({ muted: !state.muted })),
}));

type VideoLayerProps = {
  uri: string;
  // Top card on a focused screen: the only one that plays.
  active: boolean;
  // Only cards near the top get a surface; deeper ones just buffer.
  showSurface: boolean;
  // The card's swipe gesture, which must yield while the user scrubs.
  cardPan: PanGesture;
};

/**
 * Looping preview for a video card, drawn over the card's poster image. Each mounted video card
 * owns one player, so at most three exist; the one behind the top card is already buffered when
 * it moves up.
 */
export function VideoLayer({ uri, active, showSurface, cardPan }: VideoLayerProps) {
  const muted = useVideoSound((state) => state.muted);
  const toggleSound = useVideoSound((state) => state.toggle);
  const [firstFrame, setFirstFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const fraction = useSharedValue(0);
  const scrubbing = useSharedValue(false);

  const player = useVideoPlayer(uri, (created) => {
    configure(created, { loop: true, muted: true, timeUpdateEventInterval: TIME_UPDATE_INTERVAL_S });
  });

  useEffect(() => {
    configure(player, { muted });
  }, [player, muted]);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [player, active]);

  useEventListener(player, 'statusChange', ({ status }) => {
    setFailed(status === 'error');
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (scrubbing.get() || !player.duration) return;
    const next = currentTime / player.duration;
    // Looping wraps to 0; jump there instead of animating backwards across the bar.
    fraction.set(next < fraction.get() ? next : withTiming(next, { duration: TIME_UPDATE_INTERVAL_S * 1000, easing: Easing.linear }));
  });

  function seekToFraction(value: number) {
    if (!player.duration) return;
    const next = Math.min(1, Math.max(0, value));
    fraction.set(next);
    configure(player, { currentTime: next * player.duration });
  }

  function seekTo(x: number) {
    if (barWidth) seekToFraction(x / barWidth);
  }

  const scrub = usePanGesture({
    runOnJS: true,
    minDistance: 0,
    block: cardPan,
    onActivate: (event) => {
      scrubbing.set(true);
      configure(player, { scrubbingModeOptions: { scrubbingModeEnabled: true } });
      player.pause();
      seekTo(event.x);
    },
    onUpdate: (event) => seekTo(event.x),
    onFinalize: () => {
      scrubbing.set(false);
      // Android suppresses playback while scrubbing mode is on, so always switch it back off.
      configure(player, { scrubbingModeOptions: { scrubbingModeEnabled: false } });
      if (active) player.play();
    },
  });

  const progressStyle = useAnimatedStyle(() => ({ width: `${fraction.get() * 100}%` }));

  return (
    <>
      {showSurface && (
        <VideoView
          player={player}
          nativeControls={false}
          contentFit="cover"
          // Cards rotate and slide; a SurfaceView would not follow those transforms on Android.
          surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
          onFirstFrameRender={() => setFirstFrame(true)}
          style={[StyleSheet.absoluteFill, { opacity: firstFrame ? 1 : 0 }]}
          pointerEvents="none"
        />
      )}

      {failed && (
        <View style={styles.error} pointerEvents="none">
          <ThemedText type="small" style={styles.errorText}>
            {'Can’t play this video. You can still swipe it.'}
          </ThemedText>
        </View>
      )}

      {active && !failed && (
        <View style={styles.controls} pointerEvents="box-none">
          <GestureDetector gesture={scrub}>
            <View
              style={styles.scrubArea}
              onLayout={(event: LayoutChangeEvent) => setBarWidth(event.nativeEvent.layout.width)}
              accessibilityRole="adjustable"
              accessibilityLabel="Playback position"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction.get() * 100) }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) =>
                seekToFraction(
                  fraction.get() +
                    (event.nativeEvent.actionName === 'increment' ? ACCESSIBLE_SEEK_FRACTION : -ACCESSIBLE_SEEK_FRACTION)
                )
              }>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, progressStyle]} />
              </View>
            </View>
          </GestureDetector>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
            hitSlop={12}
            onPress={toggleSound}
            style={styles.soundButton}>
            <SymbolView
              name={
                muted
                  ? { ios: 'speaker.slash.fill', android: 'volume_off' }
                  : { ios: 'speaker.wave.2.fill', android: 'volume_up' }
              }
              size={18}
              tintColor="#ffffff"
            />
          </Pressable>
        </View>
      )}
    </>
  );
}

// The player is an imperative native object; setting its properties is how it is driven.
function configure(player: VideoPlayer, options: Partial<VideoPlayer>) {
  Object.assign(player, options);
}

const styles = StyleSheet.create({
  controls: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  scrubArea: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  fill: {
    height: '100%',
    backgroundColor: '#ffffff',
  },
  error: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
    right: Spacing.three,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  errorText: {
    color: '#ffffff',
    textAlign: 'center',
  },
  soundButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
