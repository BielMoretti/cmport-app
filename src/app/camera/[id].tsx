import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Mira } from '@/components/arte';
import CameraPlayer from '@/components/CameraPlayer';
import Gravacoes from '@/components/Gravacoes';
import { Cabecalho, Cartao, Pilula } from '@/components/ui';
import { useEstilos } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { buscarSaude, estadoDe, ROTULO_DA_SAUDE, ROTULO_DO_ESTADO, type Estado } from '@/lib/saude';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, aceso, vidro, type Paleta } from '@/lib/tema';
import type { Camera, SaudeDaCamera } from '@/lib/types';

type Modo = 'aoVivo' | 'gravacoes';
const TOM: Record<Estado, 'azul' | 'erro' | 'suave'> = { online: 'azul', offline: 'erro', desconhecido: 'suave' };

/** Uma câmera: o que ela mostra agora (ao vivo) ou o que mostrou (gravações). */
export default function CameraScreen() {
  const styles = useEstilos(criarEstilos);
  const { id } = useLocalSearchParams<{ id: string }>();
  const cameraId = Number(id);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [saude, setSaude] = useState<SaudeDaCamera | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>('aoVivo');

  useEffect(() => {
    if (!Number.isInteger(cameraId)) return;
    api<Camera>(`/cameras/${cameraId}`)
      .then(setCamera)
      .catch(e => setErro(e instanceof ApiError ? e.message : 'Não foi possível abrir esta câmera.'));
    // a saúde é um extra: se falhar, a tela segue sem ela
    buscarSaude(cameraId).then(setSaude).catch(() => {});
  }, [cameraId]);

  if (!Number.isInteger(cameraId) || erro) {
    return (
      <View style={styles.tela}>
        <Cabecalho titulo="Câmera" />
        <Text style={styles.erro} accessibilityRole="alert">{erro ?? 'Câmera inválida.'}</Text>
      </View>
    );
  }

  // O backend só entrega vídeo ao vivo de câmera RTMP_ISOLADA (ver CameraService.iniciar_webrtc)
  const semAoVivo = camera && (!camera.ativo || camera.tipo_conexao !== 'RTMP_ISOLADA');
  const estado = camera ? estadoDe(camera) : 'desconhecido';
  const problemas = saude?.itens.filter(i => i.situacao !== 'ok') ?? [];

  return (
    <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}>
      <Cabecalho titulo="Câmera" />

      <View style={styles.corpo}>
        <View style={styles.ficha}>
          <Text style={styles.nome}>{camera?.nome ?? ' '}</Text>
          {camera && (
            <Text style={styles.apoio} numberOfLines={2}>
              {[camera.condominio_nome, camera.poste_nome].filter(Boolean).join(', ')}
            </Text>
          )}
          {camera && (
            <View style={styles.pilulas}>
              <Pilula texto={ROTULO_DO_ESTADO[estado]} tom={TOM[estado]} />
              {saude && saude.status !== 'SEM_DADOS' && (
                <Pilula texto={ROTULO_DA_SAUDE[saude.status]} tom={saude.status === 'SAUDAVEL' ? 'azul' : saude.status === 'PROBLEMA' ? 'erro' : 'suave'} />
              )}
            </View>
          )}
        </View>

        {/* ao vivo ou gravações — uma coisa por vez na tela */}
        <View style={styles.abas} accessibilityRole="tablist">
          {([['aoVivo', 'Ao vivo'], ['gravacoes', 'Gravações']] as [Modo, string][]).map(([valor, rotulo]) => (
            <Pressable
              key={valor}
              onPress={() => setModo(valor)}
              accessibilityRole="tab"
              accessibilityState={{ selected: modo === valor }}
              style={[styles.aba, modo === valor && styles.abaAtiva]}
            >
              <Text style={[styles.abaTexto, modo === valor && styles.abaTextoAtiva]}>{rotulo}</Text>
            </Pressable>
          ))}
        </View>

        {modo === 'gravacoes' ? (
          camera && <Gravacoes cameraId={cameraId} nomeDaCamera={camera.nome} />
        ) : (
          <>
            <View style={styles.palco}>
              {semAoVivo ? (
                <View style={styles.palcoVazio}>
                  <Text style={styles.palcoTexto}>
                    {camera.ativo
                      ? 'Esta câmera fica num gravador e não transmite ao vivo pelo app. As gravações continuam disponíveis.'
                      : 'Esta câmera está desativada no sistema.'}
                  </Text>
                </View>
              ) : camera ? (
                <CameraPlayer cameraId={cameraId} />
              ) : (
                <View style={styles.palcoVazio} />
              )}
              <Mira />
            </View>

            {problemas.length > 0 && (
              <Cartao style={styles.saude}>
                <Text style={styles.saudeTitulo} accessibilityRole="header">O que ajustar no vídeo</Text>
                {problemas.map(i => (
                  <Text key={i.chave} style={styles.apoio}>{i.nome}: {i.atual}. {i.dica}</Text>
                ))}
              </Cartao>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', paddingBottom: espaco[10] },
  corpo: { paddingHorizontal: espaco[5], gap: espaco[4] },
  ficha: { gap: espaco[1] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  pilulas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco[2], marginTop: espaco[2] },

  abas: { flexDirection: 'row', ...vidro(c), borderRadius: raio.pilula, padding: espaco[1] },
  aba: { flex: 1, minHeight: componentes.chip.altura + espaco[1], borderRadius: raio.pilula, alignItems: 'center', justifyContent: 'center' },
  abaAtiva: { ...aceso(c) },
  abaTexto: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.textoSuave },
  abaTextoAtiva: { color: c.sobreLuz },

  palco: { borderRadius: raio.grande, overflow: 'hidden', borderWidth: 1, borderColor: c.vidroBorda, boxShadow: c.vidroSombra },
  palcoVazio: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo, alignItems: 'center', justifyContent: 'center', padding: espaco[6] },
  palcoTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: palco.texto, textAlign: 'center' },
  saude: { gap: espaco[1] },
  saudeTitulo: { fontFamily: fontes.nome, fontSize: corpo.nome, color: c.texto },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.erro, padding: espaco[5] },
});
