import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ViewerScreen() {
  const { id, mediaType } = useLocalSearchParams<{ id: string; mediaType?: 'image' | 'video' }>();
  const [broken, setBroken] = useState(false);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {mediaType === 'video' ? (
        <FullVideo uri={id} />
      ) : (
        <Image
          source={{ uri: id }}
          contentFit="contain"
          cachePolicy="memory"
          accessibilityLabel="Photo"
          onError={() => setBroken(true)}
          style={StyleSheet.absoluteFill}
        />
      )}
      {broken && (
        <View style={styles.message} pointerEvents="none">
          <Text style={styles.messageText}>{'Can’t load this photo. It may have been deleted.'}</Text>
        </View>
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
  message: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  messageText: {
    color: '#ffffff',
    textAlign: 'center',
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
