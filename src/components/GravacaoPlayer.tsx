import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import MarcaDagua from '@/components/MarcaDagua';
import { palco } from '@/lib/tema';

export interface ControlesDoPlayer {
  /** avança (positivo) ou volta (negativo) tantos segundos */
  pular: (segundos: number) => void;
  /** toca se estiver parado, pausa se estiver tocando */
  alternar: () => void;
}

interface Props {
  url: string;
  /** segundo do trecho onde o vídeo começa (0 = do início) */
  comecarEm?: number;
  velocidade: number;
  /** o trecho acabou — quem usa decide se emenda no próximo */
  aoTerminar: () => void;
  /** posição dentro do trecho, em segundos (atualiza ~2x por segundo) */
  aoAndar: (segundos: number) => void;
  aoMudarTocando: (tocando: boolean) => void;
}

/**
 * Toca um trecho gravado pelo link temporário do servidor. Sem os controles do
 * sistema: quem comanda é a tela de gravações (barra do tempo, ±10 s, velocidade).
 * Um trecho novo é um player novo — o componente é remontado com outra `url`.
 */
const GravacaoPlayer = forwardRef<ControlesDoPlayer, Props>(function GravacaoPlayer(
  { url, comecarEm = 0, velocidade, aoTerminar, aoAndar, aoMudarTocando }, ref,
) {
  const player = useVideoPlayer(url, p => {
    p.timeUpdateEventInterval = 0.5;
    p.playbackRate = velocidade;
    p.play();
  });

  // os avisos mudam a cada render de quem usa; a referência evita reassinar os eventos
  const avisos = useRef({ aoTerminar, aoAndar, aoMudarTocando });
  avisos.current = { aoTerminar, aoAndar, aoMudarTocando };

  useEffect(() => {
    player.playbackRate = velocidade;
  }, [player, velocidade]);

  useEffect(() => {
    // No navegador o play() dado antes de o vídeo carregar não pega: toca de novo quando ficar pronto.
    // (Só uma vez por trecho — depois disso quem manda é o botão de pausar.)
    let iniciou = false;
    const pronto = player.addListener('statusChange', e => {
      if (e.status === 'readyToPlay' && !iniciou) {
        iniciou = true;
        if (comecarEm > 0) player.currentTime = comecarEm;
        player.play();
      }
    });
    const fim = player.addListener('playToEnd', () => avisos.current.aoTerminar());
    const tempo = player.addListener('timeUpdate', e => avisos.current.aoAndar(e.currentTime));
    const tocando = player.addListener('playingChange', e => avisos.current.aoMudarTocando(e.isPlaying));
    return () => { pronto.remove(); fim.remove(); tempo.remove(); tocando.remove(); };
    // comecarEm só vale na abertura do trecho (o player é remontado a cada url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useImperativeHandle(ref, () => ({
    pular: segundos => player.seekBy(segundos),
    alternar: () => (player.playing ? player.pause() : player.play()),
  }), [player]);

  return (
    <View style={styles.caixa}>
      <VideoView player={player} nativeControls={false} contentFit="contain" style={styles.video} />
      <MarcaDagua />
    </View>
  );
});

export default GravacaoPlayer;

const styles = StyleSheet.create({
  caixa: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
});
