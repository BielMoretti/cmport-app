import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { BarraCarregando } from '@/components/efeitos';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera, Poste } from '@/lib/types';

interface Secao {
  title: string;
  observacao: string | null;
  // true = câmeras presas a um poste (desenha o trilho); false = câmeras avulsas
  poste: boolean;
  data: Camera[];
}

export default function CondominioScreen() {
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
        api<Poste[]>(`/postes?condominio_id=${condominioId}`),
        api<Camera[]>(`/cameras/por-condominio/${condominioId}`),
      ]);
      setPostes(p);
      setCameras(c);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar as câmeras. Puxe a tela para tentar de novo.');
    }
  }, [condominioId]);

  useEffect(() => {
    if (!Number.isInteger(condominioId)) {
      setErro('Condomínio inválido.');
      setCarregando(false);
      return;
    }
    carregar().finally(() => setCarregando(false));
  }, [carregar, condominioId]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  // Um condomínio pode ter câmeras em postes, câmeras avulsas (poste_id nulo) ou os dois
  const secoes = useMemo<Secao[]>(() => {
    const resultado: Secao[] = postes.map(p => ({
      title: p.nome,
      observacao: p.observacao,
      poste: true,
      data: cameras.filter(c => c.poste_id === p.id),
    }));
    const idsPostes = new Set(postes.map(p => p.id));
    const avulsas = cameras.filter(c => c.poste_id === null || !idsPostes.has(c.poste_id));
    if (avulsas.length > 0) {
      resultado.push({ title: 'Fora de poste', observacao: null, poste: false, data: avulsas });
    }
    return resultado;
  }, [postes, cameras]);

  return (
    <View style={styles.tela}>
      <Stack.Screen options={{ title: nome ?? 'Condomínio' }} />
      <BarraCarregando ativa={carregando} />

      <SectionList
        sections={carregando ? [] : secoes}
        keyExtractor={item => String(item.id)}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={erro ? <Text style={styles.erro} accessibilityRole="alert">{erro}</Text> : null}
        ListEmptyComponent={
          !carregando && !erro ? (
            <Text style={styles.vazio}>
              Este condomínio ainda não tem poste nem câmera. O cadastro é feito no sistema, pelo computador.
            </Text>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.cabeca}>
            <View style={styles.coluna}>
              {section.poste && (
                <>
                  {/* topo do poste: disco azul com halo */}
                  <View style={styles.halo}>
                    <View style={styles.topo} />
                  </View>
                  {section.data.length > 0 && <View style={styles.trilhoCabeca} />}
                </>
              )}
            </View>
            <View style={styles.cabecaTexto}>
              <Text style={styles.posteNome} accessibilityRole="header">{section.title}</Text>
              {section.observacao && <Text style={styles.posteObs}>{section.observacao}</Text>}
              {section.poste && section.data.length === 0 && (
                <Text style={styles.posteObs}>Nenhuma câmera neste poste.</Text>
              )}
            </View>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const ultima = index === section.data.length - 1;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir a câmera ${item.nome}`}
              onPress={() => router.push({ pathname: '/camera/[id]', params: { id: String(item.id) } })}
              style={({ pressed }) => [styles.camera, pressed && styles.cameraPressionada]}
            >
              {/* O poste: trilho vertical que desce até a última câmera, com um braço pra cada uma */}
              <View style={styles.coluna}>
                {section.poste && (
                  <>
                    <View style={[styles.trilho, ultima && styles.trilhoFim]} />
                    <View style={styles.braco} />
                  </>
                )}
              </View>
              <View style={[styles.cameraTexto, !ultima && styles.cameraFio]}>
                <Text style={styles.cameraNome} numberOfLines={1}>{item.nome}</Text>
                <Text style={styles.acao}>Abrir</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  lista: { paddingBottom: espaco[10] },

  cabeca: { flexDirection: 'row', marginTop: espaco[3] },
  cabecaTexto: { flex: 1, paddingTop: espaco[3], paddingBottom: espaco[2.5], paddingRight: espaco[4], gap: espaco[0.5] },
  posteNome: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  posteObs: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },

  coluna: { width: componentes.poste.coluna, alignItems: 'center' },
  halo: {
    width: componentes.poste.halo, height: componentes.poste.halo, borderRadius: componentes.poste.halo / 2, marginTop: espaco[3], backgroundColor: c.azulSuave,
    alignItems: 'center', justifyContent: 'center',
  },
  topo: { width: componentes.poste.topo, height: componentes.poste.topo, borderRadius: componentes.poste.topo / 2, backgroundColor: c.azul, boxShadow: c.brilho },
  trilhoCabeca: { flex: 1, width: componentes.poste.trilho, backgroundColor: c.azul },
  trilho: { position: 'absolute', top: 0, bottom: 0, width: componentes.poste.trilho, backgroundColor: c.azul },
  // na última câmera o trilho para na altura do braço — o poste termina ali
  trilhoFim: { bottom: '50%' },
  braco: {
    position: 'absolute', top: '50%', left: componentes.poste.coluna / 2, right: 0,
    height: componentes.poste.trilho, marginTop: -componentes.poste.trilho / 2, backgroundColor: c.azul,
  },

  camera: { flexDirection: 'row', minHeight: componentes.linha.alturaMin },
  cameraPressionada: { backgroundColor: c.azulSuave },
  cameraTexto: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco[3], paddingVertical: espaco[3.5], paddingLeft: espaco[2.5], paddingRight: espaco[4],
  },
  cameraFio: { borderBottomWidth: 1, borderBottomColor: c.linha },
  cameraNome: { flex: 1, fontFamily: fontes.textoForte, fontSize: corpo.nome, color: c.texto },
  acao: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },

  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.erro, padding: espaco[4] },
  vazio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, padding: espaco[4], paddingTop: espaco[6] },
});
