import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { GlifoCamera } from '@/components/arte';
import { BarraCarregando } from '@/components/efeitos';
import { Botao, Mensagem, Selo } from '@/components/formulario';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera, Poste } from '@/lib/types';

/** Administração de um condomínio: postes e câmeras, inclusive os desativados. */
export default function AdministrarCondominioScreen() {
  const router = useRouter();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const { id, nome } = useLocalSearchParams<{ id: string; nome?: string }>();
  const condominioId = Number(id);

  const [postes, setPostes] = useState<Poste[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [p, c] = await Promise.all([
        api<Poste[]>(`/postes?condominio_id=${condominioId}&incluir_inativos=true`),
        api<Camera[]>(`/cameras/por-condominio/${condominioId}?incluir_inativas=true`),
      ]);
      setPostes(p);
      setCameras(c);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar. Puxe a tela para tentar de novo.');
    }
  }, [condominioId]);

  // volta de um formulário → recarrega pra mostrar o que mudou
  useFocusEffect(useCallback(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]));

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const idsPostes = new Set(postes.map(p => p.id));
  const avulsas = cameras.filter(c => c.poste_id === null || !idsPostes.has(c.poste_id));
  const cid = String(condominioId);

  const linhaCamera = (c: Camera) => (
    <Pressable
      key={c.id}
      onPress={() => router.push({ pathname: '/admin/camera', params: { condominioId: cid, id: String(c.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`Editar a câmera ${c.nome}`}
      style={({ pressed }) => [styles.camera, pressed && styles.pressionada]}
    >
      <GlifoCamera cor={c.ativo ? cores.azul : cores.textoSuave} />
      <View style={styles.cameraTexto}>
        <Text style={[styles.cameraNome, !c.ativo && styles.apagado]} numberOfLines={1}>{c.nome}</Text>
        <Text style={styles.cameraTipo}>{c.tipo_conexao === 'RTMP_ISOLADA' ? 'Transmite ao vivo' : `Gravador, canal ${c.canal ?? '?'}`}</Text>
      </View>
      {!c.ativo && <Selo texto="Desativada" />}
      <Text style={styles.acao}>Editar</Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={styles.conteudo}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
    >
      <Stack.Screen options={{ title: 'Administrar' }} />
      <BarraCarregando ativa={carregando} />

      <View style={styles.corpo}>
        <Text style={styles.titulo}>{nome ?? 'Condomínio'}</Text>
        {erro && <Mensagem texto={erro} tom="erro" />}

        <View style={styles.botoes}>
          <View style={styles.botao}>
            <Botao titulo="Novo poste" onPress={() => router.push({ pathname: '/admin/poste', params: { condominioId: cid } })} />
          </View>
          <View style={styles.botao}>
            <Botao titulo="Nova câmera" variante="secundario" onPress={() => router.push({ pathname: '/admin/camera', params: { condominioId: cid } })} />
          </View>
        </View>

        {!carregando && !erro && postes.length === 0 && avulsas.length === 0 && (
          <Mensagem texto="Este condomínio ainda não tem nada cadastrado. Comece criando um poste." />
        )}

        {postes.map(p => (
          <View key={p.id} style={styles.poste}>
            <View style={styles.posteCabeca}>
              <View style={styles.posteTexto}>
                <Text style={[styles.posteNome, !p.ativo && styles.apagado]} numberOfLines={2}>{p.nome}</Text>
                {p.observacao && <Text style={styles.cameraTipo} numberOfLines={2}>{p.observacao}</Text>}
              </View>
              {!p.ativo && <Selo texto="Desativado" />}
              <Pressable
                onPress={() => router.push({ pathname: '/admin/poste', params: { condominioId: cid, id: String(p.id) } })}
                hitSlop={espaco[3]}
                accessibilityRole="button"
                accessibilityLabel={`Editar o ${p.nome}`}
              >
                <Text style={styles.acao}>Editar</Text>
              </Pressable>
            </View>
            {cameras.filter(c => c.poste_id === p.id).map(linhaCamera)}
            <Pressable
              onPress={() => router.push({ pathname: '/admin/camera', params: { condominioId: cid, posteId: String(p.id) } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.adicionar, pressed && styles.pressionada]}
            >
              <Text style={styles.acao}>Adicionar câmera neste poste</Text>
            </Pressable>
          </View>
        ))}

        {avulsas.length > 0 && (
          <View style={styles.poste}>
            <View style={styles.posteCabeca}>
              <Text style={styles.posteNome}>Fora de poste</Text>
            </View>
            {avulsas.map(linhaCamera)}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { paddingBottom: espaco[10] },
  corpo: { paddingHorizontal: espaco[4], paddingTop: espaco[2], gap: espaco[4] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  botoes: { flexDirection: 'row', gap: espaco[3] },
  botao: { flex: 1 },

  poste: { backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha, overflow: 'hidden' },
  posteCabeca: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], padding: espaco[4],
    borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  posteTexto: { flex: 1, gap: espaco[0.5] },
  posteNome: { flex: 1, fontFamily: fontes.nome, fontSize: corpo.nomeGrande, lineHeight: entrelinha.base, color: c.texto },
  camera: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin,
    paddingHorizontal: espaco[4], paddingVertical: espaco[2.5], borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  pressionada: { backgroundColor: c.azulSuave },
  cameraTexto: { flex: 1, gap: espaco[0.5] },
  cameraNome: { fontFamily: fontes.textoForte, fontSize: corpo.nome, color: c.texto },
  cameraTipo: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
  apagado: { color: c.textoSuave },
  adicionar: { minHeight: componentes.alvoDeToque, justifyContent: 'center', paddingHorizontal: espaco[4] },
  acao: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },
});
