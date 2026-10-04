import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Mira } from '@/components/arte';
import CameraPlayer from '@/components/CameraPlayer';
import GravacaoPlayer from '@/components/GravacaoPlayer';
import Gravacoes, { horaDoTrecho } from '@/components/Gravacoes';
import { useEstilos } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import type { Trecho } from '@/lib/gravacoes';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, type Paleta } from '@/lib/tema';
import type { Camera } from '@/lib/types';

export default function CameraScreen() {
  const styles = useEstilos(criarEstilos);
  const { id } = useLocalSearchParams<{ id: string }>();
  const cameraId = Number(id);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // null = ao vivo; um trecho = assistindo a gravação
  const [trecho, setTrecho] = useState<Trecho | null>(null);

  useEffect(() => {
    if (!Number.isInteger(cameraId)) return;
    api<Camera>(`/cameras/${cameraId}`)
      .then(setCamera)
      .catch(e => setErro(e instanceof ApiError ? e.message : 'Não foi possível abrir esta câmera.'));
  }, [cameraId]);

  if (!Number.isInteger(cameraId) || erro) {
    return <Text style={styles.erro} accessibilityRole="alert">{erro ?? 'Câmera inválida.'}</Text>;
  }

  // O backend só entrega vídeo ao vivo de câmera RTMP_ISOLADA (ver CameraService.iniciar_webrtc)
  const semAoVivo = camera && (!camera.ativo || camera.tipo_conexao !== 'RTMP_ISOLADA');

  return (
    <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}>
      <Stack.Screen options={{ title: 'Câmera' }} />

      {/* O vídeo ocupa a largura toda, em palco preto nos dois temas */}
      <View style={styles.palco}>
        {trecho?.url ? (
          <GravacaoPlayer key={trecho.url} url={trecho.url} />
        ) : semAoVivo ? (
          <View style={styles.palcoVazio}>
            <Text style={styles.palcoTexto}>
              {camera.ativo
                ? 'Esta câmera fica num gravador e não transmite ao vivo pelo app.'
                : 'Esta câmera está desativada no sistema.'}
            </Text>
          </View>
        ) : camera ? (
          <CameraPlayer cameraId={cameraId} />
        ) : (
          <View style={styles.palcoVazio} />
        )}
        {/* cantos de mira sobre o vídeo; não aparecem na gravação pra não cobrir os controles */}
        {!trecho && <Mira />}
      </View>

      <View style={styles.ficha}>
        <View style={styles.fichaTexto}>
          <Text style={styles.nome}>{camera?.nome ?? ' '}</Text>
          {trecho ? (
            <Text style={styles.apoio}>
              Gravação de {trecho.inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às {horaDoTrecho(trecho)}
            </Text>
          ) : (
            camera?.condominio_nome && <Text style={styles.apoio}>{camera.condominio_nome}</Text>
          )}
        </View>
        {trecho && (
          <Pressable onPress={() => setTrecho(null)} accessibilityRole="button" style={styles.voltar}>
            <Text style={styles.voltarTexto}>Voltar ao vivo</Text>
          </Pressable>
        )}
      </View>

      {camera && <Gravacoes cameraId={cameraId} tocando={trecho} onAssistir={setTrecho} />}
    </ScrollView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { paddingBottom: espaco[10] },
  palco: { borderBottomWidth: 1, borderBottomColor: c.luz, boxShadow: c.brilho },
  palcoVazio: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo, alignItems: 'center', justifyContent: 'center', padding: espaco[6] },
  palcoTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: palco.texto, textAlign: 'center' },
  ficha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], paddingHorizontal: espaco[4], paddingVertical: espaco[4],
    borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  fichaTexto: { flex: 1, gap: espaco[1] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  voltar: { borderRadius: raio.pilula, borderWidth: 1, borderColor: c.azul, paddingHorizontal: componentes.chip.respiroH, minHeight: componentes.chip.altura, justifyContent: 'center' },
  voltarTexto: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.erro, padding: espaco[4] },
});
