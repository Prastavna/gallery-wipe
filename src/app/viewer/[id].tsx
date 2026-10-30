import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ViewerScreen() {
  const { id, mediaType } = useLocalSearchParams<{ id: string; mediaType?: 'image' | 'video' }>();

  return (
    <View style={styles.container}>
      {mediaType === 'video' ? (
        <FullVideo uri={id} />
      ) : (
        <Image source={{ uri: id }} contentFit="contain" cachePolicy="memory" style={StyleSheet.absoluteFill} />
      )}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          onPress={() => router.back()}
          style={styles.close}>
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={20} tintColor="#ffffff" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function FullVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (created) => {
    created.play();
  });

  return <VideoView player={player} nativeControls contentFit="contain" style={StyleSheet.absoluteFill} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    flex: 1,
    alignItems: 'flex-end',
    padding: 16,
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});
