import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { Pulso } from '@/components/efeitos';
import MarcaDagua from '@/components/MarcaDagua';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio } from '@/lib/tema';

type Status = 'conectando' | 'ao-vivo' | 'erro';

const TIMEOUT_ICE_MS = 3000;

/**
 * Versão web do player (pré-visualização no navegador) — o Metro escolhe este
 * arquivo no lugar do CameraPlayer.tsx quando a plataforma é web. Mesmo fluxo,
 * mas com o RTCPeerConnection e o <video> do próprio navegador, já que o
 * react-native-webrtc só existe em Android/iOS.
 */
export default function CameraPlayer({ cameraId }: { cameraId: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('conectando');
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const reconectar = useCallback(() => setTentativa(t => t + 1), []);

  useEffect(() => {
    let cancelado = false;
    const pc = new RTCPeerConnection();

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (ev) => {
      if (videoRef.current && ev.streams[0]) videoRef.current.srcObject = ev.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (cancelado) return;
      if (pc.connectionState === 'connected') setStatus('ao-vivo');
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStatus('erro');
        setErro('O vídeo parou de chegar. Confira sua internet e tente de novo.');
      }
    };

    const esperarCandidatos = () => new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(resolve, TIMEOUT_ICE_MS);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    (async () => {
      setStatus('conectando');
      setErro(null);
      try {
        await pc.setLocalDescription(await pc.createOffer());
        await esperarCandidatos();
        if (cancelado || !pc.localDescription) return;

        const res = await api<{ sdp: string }>(`/cameras/${cameraId}/webrtc`, {
          method: 'POST',
          body: { sdp: pc.localDescription.sdp },
        });
        if (cancelado) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: res.sdp });
      } catch (e) {
        if (cancelado) return;
        setStatus('erro');
        setErro(e instanceof ApiError ? e.message : 'Não foi possível conectar ao vídeo. Confira sua internet e tente de novo.');
      }
    })();

    return () => {
      cancelado = true;
      pc.close();
    };
  }, [cameraId, tentativa]);

  return (
    <View style={styles.caixa}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {/* só quando há imagem: marca quem está assistindo */}
      {status === 'ao-vivo' && <MarcaDagua />}

      {status === 'ao-vivo' && (
        <View style={styles.selo}>
          <Pulso cor={palco.aoVivo} />
          <Text style={styles.seloTexto}>Ao vivo</Text>
        </View>
      )}

      {status === 'conectando' && (
        <View style={styles.centro}>
          <ActivityIndicator color={palco.texto} />
          <Text style={styles.aviso}>Conectando à câmera…</Text>
        </View>
      )}

      {status === 'erro' && (
        <View style={styles.centro}>
          <Text style={styles.aviso}>{erro}</Text>
          <Pressable onPress={reconectar} style={styles.botao}>
            <Text style={styles.botaoTexto}>Tentar de novo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // palco do vídeo: de borda a borda, sem cantos arredondados
  caixa: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo, overflow: 'hidden' },
  centro: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: espaco[3.5], padding: espaco[6] },
  aviso: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: palco.texto, textAlign: 'center' },
  selo: {
    position: 'absolute', top: espaco[3], left: espaco[3], flexDirection: 'row', alignItems: 'center', gap: espaco[1.5],
    backgroundColor: palco.veu, borderRadius: raio.pequeno, paddingHorizontal: espaco[2], paddingVertical: espaco[1],
  },
  seloTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: palco.texto },
  botao: { backgroundColor: palco.botaoFundo, borderRadius: componentes.botaoNoPalco.raio, paddingHorizontal: componentes.botaoNoPalco.respiroH, minHeight: componentes.botaoNoPalco.altura, justifyContent: 'center' },
  botaoTexto: { fontFamily: fontes.nome, fontSize: corpo.base, color: palco.botaoTexto },
});
