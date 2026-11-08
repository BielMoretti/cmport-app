import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaStream, RTCPeerConnection, RTCSessionDescription, RTCView } from 'react-native-webrtc';

import { api, ApiError } from '@/lib/api';
import { Pulso } from '@/components/efeitos';
import MarcaDagua from '@/components/MarcaDagua';
import { capturarCaixa, guardarFoto, nomeDaFoto, type ControlesDoPlayer } from '@/lib/foto-camera';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio } from '@/lib/tema';
import { tr } from '@/lib/idioma';

type Status = 'conectando' | 'ao-vivo' | 'erro';

// no Modo TV: quanto esperar antes de tentar de novo, sozinho, um vídeo que caiu
const RECONECTAR_DEPOIS_DE_MS = 15_000;

// Tempo máximo esperando os candidatos ICE antes de mandar o offer
const TIMEOUT_ICE_MS = 3000;

// foto: quanto esperar a imagem copiada aparecer na caixa da marca antes de desistir
const ESPERA_DA_FOTO_MS = 5000;
const proximoQuadro = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/**
 * Player ao vivo de uma câmera via WebRTC — mesmo fluxo do CameraPlayer do cmport-front.
 *
 * O app nunca fala direto com o MediaMTX: o SDP offer vai pro backend
 * (POST /cameras/{id}/webrtc, autenticado por JWT), que repassa pro MediaMTX
 * pela rede interna e devolve o answer. Só o vídeo (UDP) vem direto do servidor.
 * Por isso a negociação é "sem trickle": espera todos os candidatos ICE antes.
 *
 * A foto (ref.fotografar) sai em dois passos, explicados em lib/foto-camera.ts.
 */
const CameraPlayer = forwardRef<ControlesDoPlayer, {
  cameraId: number;
  /** ocupa todo o espaço que receber (tela cheia), em vez da proporção 16:9 */
  cheio?: boolean;
  /** tela que fica sozinha (Modo TV): se o vídeo cair, tenta de novo sem ninguém tocar */
  reconectarSozinho?: boolean;
  /** entra no nome do arquivo da foto */
  nomeDaCamera?: string;
  /** avisa quando a imagem começa ou para de chegar (o botão da foto só aparece com imagem) */
  aoMudarAoVivo?: (aoVivo: boolean) => void;
}>(function CameraPlayer({ cameraId, cheio = false, reconectarSozinho = false, nomeDaCamera, aoMudarAoVivo }, ref) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('conectando');
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // foto: a caixa só com o vídeo, a caixa com a marca e a imagem copiada no passo 1
  const caixaDoVideo = useRef<View>(null);
  const caixaDaFoto = useRef<View>(null);
  const [quadro, setQuadro] = useState<string | null>(null);
  const quadroCarregou = useRef<(() => void) | null>(null);

  const reconectar = useCallback(() => setTentativa(t => t + 1), []);

  useEffect(() => { aoMudarAoVivo?.(status === 'ao-vivo'); }, [status, aoMudarAoVivo]);

  useImperativeHandle(ref, () => ({
    fotografar: async () => {
      if (status !== 'ao-vivo' || !caixaDoVideo.current) throw new Error(tr('O vídeo ainda não tem imagem. Espere carregar e tente de novo.'));
      const nome = nomeDaFoto(nomeDaCamera, new Date());
      let semMarca: string;
      try {
        // passo 1: só o vídeo
        semMarca = await capturarCaixa(caixaDoVideo, true);
      } catch {
        throw new Error(tr('Este aparelho não deixou copiar a imagem do vídeo. Tente de novo; se continuar, use o print do celular.'));
      }
      let comMarca: string;
      try {
        // passo 2: a imagem copiada vai para a caixa da marca; espera ela aparecer e a marca se espalhar
        await new Promise<void>((resolve, reject) => {
          const desistir = setTimeout(() => { quadroCarregou.current = null; reject(new Error('tempo')); }, ESPERA_DA_FOTO_MS);
          quadroCarregou.current = () => { clearTimeout(desistir); quadroCarregou.current = null; resolve(); };
          setQuadro(semMarca);
        });
        await proximoQuadro();
        await proximoQuadro();
        comMarca = await capturarCaixa(caixaDaFoto, false, nome);
      } catch {
        throw new Error(tr('Não foi possível tirar a foto. Tente de novo.'));
      } finally {
        setQuadro(null);
      }
      try {
        return await guardarFoto(comMarca, nome);
      } catch {
        throw new Error(tr('A foto foi tirada, mas não foi possível salvá-la no aparelho.'));
      }
    },
  }), [status, nomeDaCamera]);

  useEffect(() => {
    if (!reconectarSozinho || status !== 'erro') return;
    const t = setTimeout(reconectar, RECONECTAR_DEPOIS_DE_MS);
    return () => clearTimeout(t);
  }, [reconectarSozinho, status, reconectar]);

  useEffect(() => {
    let cancelado = false;
    const pc = new RTCPeerConnection();

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // on* em vez de addEventListener: o pacote não publica os tipos do EventTarget que ele estende
    pc.ontrack = (ev: { streams: MediaStream[] }) => {
      if (!cancelado && ev.streams[0]) setStream(ev.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (cancelado) return;
      if (pc.connectionState === 'connected') setStatus('ao-vivo');
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStatus('erro');
        setErro(tr('O vídeo parou de chegar. Confira sua internet e tente de novo.'));
      }
    };

    const esperarCandidatos = () => new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(resolve, TIMEOUT_ICE_MS);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
    });

    (async () => {
      setStatus('conectando');
      setErro(null);
      setStream(null);
      try {
        await pc.setLocalDescription(await pc.createOffer({}));
        await esperarCandidatos();
        if (cancelado || !pc.localDescription) return;

        const res = await api<{ sdp: string }>(`/cameras/${cameraId}/webrtc`, {
          method: 'POST',
          body: { sdp: pc.localDescription.sdp },
        });
        if (cancelado) return;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: res.sdp }));
      } catch (e) {
        if (cancelado) return;
        setStatus('erro');
        setErro(e instanceof ApiError ? e.message : tr('Não foi possível conectar ao vídeo. Confira sua internet e tente de novo.'));
      }
    })();

    return () => {
      cancelado = true;
      pc.close();
    };
  }, [cameraId, tentativa]);

  return (
    <View style={cheio ? styles.caixaCheia : styles.caixa}>
      {stream && status !== 'erro' && (
        // a caixa existe para a foto copiar só o vídeo (collapsable: o Android não pode sumir com ela)
        <View ref={caixaDoVideo} collapsable={false} style={StyleSheet.absoluteFill}>
          <RTCView streamURL={stream.toURL()} objectFit="contain" style={StyleSheet.absoluteFill} />
        </View>
      )}

      {/* só quando há imagem: marca quem está assistindo */}
      {status === 'ao-vivo' && <MarcaDagua />}

      {/* foto, passo 2: a imagem copiada com a marca por cima, do tamanho do palco. Fica na tela
          só enquanto é copiada (um instante, como o clique de uma câmera) */}
      {quadro && (
        <View ref={caixaDaFoto} collapsable={false} style={styles.foto} pointerEvents="none">
          <Image source={{ uri: quadro }} style={StyleSheet.absoluteFill} resizeMode="stretch" onLoad={() => quadroCarregou.current?.()} />
          <MarcaDagua />
        </View>
      )}

      {status === 'ao-vivo' && (
        <View style={styles.selo}>
          <Pulso cor={palco.aoVivo} />
          <Text style={styles.seloTexto}>{tr('Ao vivo')}</Text>
        </View>
      )}

      {status === 'conectando' && (
        <View style={styles.centro}>
          <ActivityIndicator color={palco.texto} />
          <Text style={styles.aviso}>{tr('Conectando à câmera…')}</Text>
        </View>
      )}

      {status === 'erro' && (
        <View style={styles.centro}>
          <Text style={styles.aviso}>{erro}</Text>
          <Pressable onPress={reconectar} style={styles.botao}>
            <Text style={styles.botaoTexto}>{tr('Tentar de novo')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

export default CameraPlayer;

const styles = StyleSheet.create({
  // palco do vídeo: de borda a borda, sem cantos arredondados
  caixa: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo, overflow: 'hidden' },
  caixaCheia: { flex: 1, width: '100%', backgroundColor: palco.fundo, overflow: 'hidden' },
  foto: { ...StyleSheet.absoluteFill, backgroundColor: palco.fundo },
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
