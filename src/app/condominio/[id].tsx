import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { GlifoCamera, GlifoPoste, Horizonte, Varredura, Veu } from '@/components/arte';
import { Entrada } from '@/components/efeitos';
import { Mensagem } from '@/components/formulario';
import { Cabecalho, Cartao, Esqueleto, IconeCaixa, Pilula } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { estadoDe, ROTULO_DO_ESTADO, type Estado } from '@/lib/saude';
import { componentes, corpo, entrelinha, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import type { Camera, Poste } from '@/lib/types';

const TOM: Record<Estado, 'azul' | 'erro' | 'suave'> = { online: 'azul', offline: 'erro', desconhecido: 'suave' };

interface Grupo {
  chave: string;
  titulo: string;
  observacao: string | null;
  posteId: number | null;
  cameras: Camera[];
}

/** Um condomínio: cada poste é um cartão, com as câmeras dele dentro. */
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
  const grupos = useMemo<Grupo[]>(() => {
    const lista: Grupo[] = postes.map(p => ({
      chave: `p${p.id}`, titulo: p.nome, observacao: p.observacao, posteId: p.id, cameras: cameras.filter(c => c.poste_id === p.id),
    }));
    const ids = new Set(postes.map(p => p.id));
    const avulsas = cameras.filter(c => c.poste_id === null || !ids.has(c.poste_id));
    if (avulsas.length > 0) lista.push({ chave: 'avulsas', titulo: 'Fora de poste', observacao: null, posteId: null, cameras: avulsas });
    return lista;
  }, [postes, cameras]);

  return (
    <View style={styles.tela}>
      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        <Cabecalho titulo="Condomínio" />

        <View style={styles.corpo}>
          {/* a silhueta deste condomínio — a mesma do cartão dele no início */}
          <View style={styles.faixa}>
            <Horizonte semente={condominioId} style={StyleSheet.absoluteFill} />
            <Varredura altura={componentes.faixa.altura} />
            <Veu cor={cores.veu} inicio={0.3} />
            <Text style={styles.faixaNome} numberOfLines={2}>{nome ?? 'Condomínio'}</Text>
          </View>

          {erro && <Mensagem texto={erro} tom="erro" />}

          {carregando ? (
            <>
              <Esqueleto altura={componentes.cartao.alturaMin * 1.5} />
              <Esqueleto altura={componentes.cartao.alturaMin} />
            </>
          ) : grupos.length === 0 && !erro ? (
            <Mensagem texto="Este condomínio ainda não tem poste nem câmera. O cadastro é feito na aba Gestão." />
          ) : (
            grupos.map((g, i) => (
              <Entrada key={g.chave} ordem={i}>
                <Cartao style={styles.grupo}>
                  <Pressable
                    disabled={g.posteId === null}
                    onPress={() => router.push({ pathname: '/poste/[id]', params: { id: String(g.posteId) } })}
                    accessibilityRole={g.posteId === null ? undefined : 'button'}
                    accessibilityLabel={g.posteId === null ? undefined : `Abrir o painel do ${g.titulo}`}
                    style={styles.grupoCabeca}
                  >
                    <IconeCaixa tom={g.posteId === null ? 'suave' : 'azul'}>
                      <GlifoPoste cor={g.posteId === null ? cores.textoSuave : cores.azul} tamanho={componentes.iconeCaixa.glifo} />
                    </IconeCaixa>
                    <View style={styles.grupoTexto}>
                      <Text style={styles.grupoTitulo} numberOfLines={1}>{g.titulo}</Text>
                      {g.observacao && <Text style={styles.resumo} numberOfLines={2}>{g.observacao}</Text>}
                    </View>
                    {g.posteId !== null && <Text style={styles.acao}>Painel</Text>}
                  </Pressable>

                  {g.cameras.length === 0 ? (
                    <Text style={styles.vazio}>Nenhuma câmera neste poste.</Text>
                  ) : (
                    g.cameras.map(c => {
                      const estado = estadoDe(c);
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => router.push({ pathname: '/camera/[id]', params: { id: String(c.id) } })}
                          accessibilityRole="button"
                          accessibilityLabel={`Abrir a câmera ${c.nome}, ${ROTULO_DO_ESTADO[estado]}`}
                          style={({ pressed }) => [styles.camera, pressed && styles.cameraPressionada]}
                        >
                          <GlifoCamera cor={cores.azul} />
                          <Text style={styles.cameraNome} numberOfLines={1}>{c.nome}</Text>
                          <Pilula texto={ROTULO_DO_ESTADO[estado]} tom={TOM[estado]} />
                        </Pressable>
                      );
                    })
                  )}
                </Cartao>
              </Entrada>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingBottom: espaco[10], width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center' },
  corpo: { paddingHorizontal: espaco[5], gap: espaco[4] },
  faixa: {
    height: componentes.faixa.altura, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: raio.grande,
    backgroundColor: c.superficie, borderWidth: 1, borderColor: c.linha, boxShadow: c.brilho,
  },
  faixaNome: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto, padding: espaco[4] },

  grupo: { padding: 0 },
  grupoCabeca: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], padding: espaco[4] },
  grupoTexto: { flex: 1, gap: espaco[0.5] },
  grupoTitulo: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  resumo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, lineHeight: entrelinha.base, color: c.textoSuave },
  acao: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.azul },
  vazio: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave, paddingHorizontal: espaco[4], paddingBottom: espaco[4] },
  camera: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin,
    paddingHorizontal: espaco[4], borderTopWidth: 1, borderTopColor: c.linha,
  },
  cameraPressionada: { backgroundColor: c.azulSuave },
  cameraNome: { flex: 1, fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto },
});
