import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Monitor } from '@/components/central';
import { Fundo } from '@/components/arte';
import { Entrada } from '@/components/efeitos';
import { Mensagem } from '@/components/formulario';
import { Esqueleto, Saudacao } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, espaco, fontes, raio, aceso, vidro, type Paleta } from '@/lib/tema';
import type { Camera } from '@/lib/types';
import { tr } from '@/lib/idioma';

// o servidor renova a imagem de cada câmera a cada ~30 s
const INTERVALO_MS = 30_000;

/** Câmeras: a parede de monitores, com a imagem mais recente de cada uma. */
export default function CamerasScreen() {
  const router = useRouter();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const { width } = useWindowDimensions();

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [filtro, setFiltro] = useState<number | null>(null);
  const [grande, setGrande] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCameras(await api<Camera[]>('/cameras'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível carregar as câmeras. Puxe a tela para tentar de novo.'));
    }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar().finally(() => setCarregando(false));
    const t = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]));

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  // condomínios que aparecem no filtro: só os que têm câmera
  const condominios = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const c of cameras) if (!mapa.has(c.condominio_id)) mapa.set(c.condominio_id, c.condominio_nome ?? tr('Condomínio {0}', [c.condominio_id]));
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [cameras]);

  const visiveis = filtro === null ? cameras : cameras.filter(c => c.condominio_id === filtro);
  const colunas = grande ? 1 : 2;
  const larguraUtil = Math.min(width, componentes.conteudo.larguraMaxima) - espaco[5] * 2;
  // arredonda para baixo: no celular a largura da tela não é um número inteiro e, com a conta
  // exata, as duas colunas somavam uma fração a mais que a fileira — a segunda caía para baixo
  const larguraMonitor = Math.floor((larguraUtil - espaco[3] * (colunas - 1)) / colunas) - 1;

  return (
    <View style={styles.tela}>
      <Fundo />
      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        <Saudacao titulo={tr('Câmeras')} />

        <View style={styles.corpo}>
          {erro && <Mensagem texto={erro} tom="erro" />}

          {condominios.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtros} style={styles.filtrosArea}>
              {[{ id: null as number | null, nome: tr('Todas') }, ...condominios].map(c => {
                const ativo = c.id === filtro;
                return (
                  <Pressable
                    key={String(c.id)}
                    onPress={() => setFiltro(c.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ativo }}
                    style={[styles.chip, ativo && styles.chipAtivo]}
                  >
                    <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>{c.nome}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {!carregando && cameras.length > 0 && (
            <View style={styles.linha}>
              <Text style={styles.contagem}>{visiveis.length} {visiveis.length === 1 ? tr('câmera') : tr('câmeras')}</Text>
              <View style={styles.acoes}>
                {/* a parede ao vivo, de ponta a ponta, para deixar numa TV ou tablet */}
                <Pressable onPress={() => router.push('/tv')} accessibilityRole="button" style={styles.chip}>
                  <Text style={styles.chipTexto}>{tr('Modo TV')}</Text>
                </Pressable>
                <Pressable onPress={() => setGrande(g => !g)} accessibilityRole="button" style={styles.chip}>
                  <Text style={styles.chipTexto}>{grande ? tr('Ver em grade') : tr('Ver maior')}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {carregando ? (
            <View style={styles.parede}>
              {[0, 1, 2, 3].map(i => <Esqueleto key={i} altura={(larguraMonitor * 9) / 16} largura={larguraMonitor} />)}
            </View>
          ) : cameras.length === 0 && !erro ? (
            <Mensagem texto={tr('Nenhuma câmera liberada para você ainda. Fale com a CM Port para pedir acesso.')} />
          ) : (
            <View style={styles.parede}>
              {visiveis.map((c, i) => (
                <View key={c.id} style={{ width: larguraMonitor }}>
                  <Entrada ordem={i}>
                    <Monitor camera={c} grande={grande} onPress={() => router.push({ pathname: '/camera/[id]', params: { id: String(c.id) } })} />
                  </Entrada>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingBottom: componentes.abas.reserva, width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center' },
  corpo: { paddingHorizontal: espaco[5], gap: espaco[4] },
  filtrosArea: { marginHorizontal: -espaco[5] },
  filtros: { paddingHorizontal: espaco[5], gap: espaco[2] },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contagem: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave },
  acoes: { flexDirection: 'row', gap: espaco[2] },
  chip: {
    borderRadius: raio.pilula, ...vidro(c),
    paddingHorizontal: componentes.chip.respiroH, minHeight: componentes.chip.altura, justifyContent: 'center',
    maxWidth: componentes.parede.larguraMinima,
  },
  chipAtivo: { ...aceso(c), borderColor: c.luz },
  chipTexto: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.textoSuave },
  chipTextoAtivo: { color: c.sobreLuz },
  parede: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco[3] },
});
