import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { palco } from '@/lib/tema';

/** Toca um trecho gravado a partir do link temporário que o servidor devolve. */
export default function GravacaoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, p => { p.play(); });

  return (
    <View style={styles.caixa}>
      <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo },
  video: { width: '100%', height: '100%' },
});
