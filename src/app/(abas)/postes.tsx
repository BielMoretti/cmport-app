import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { GlifoCameraAba, GlifoPoste } from '@/components/arte';
import { Entrada } from '@/components/efeitos';
import { Mensagem } from '@/components/formulario';
import { Bloco, Cartao, Esqueleto, IconeCaixa, Pilula, Saudacao } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { condominiosDoPainel, type CondominioDoPainel } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { estadoDe } from '@/lib/saude';
import { componentes, corpo, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera, Condominio, Poste } from '@/lib/types';

/** Postes: o que está instalado em cada condomínio e como estão as câmeras de cada poste. */
export default function PostesScreen() {
  const router = useRouter();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const [condominios, setCondominios] = useState<CondominioDoPainel[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [todos, listaPostes, listaCameras] = await Promise.all([
        api<Condominio[]>('/condominios?tipo=CONDOMINIO&ativo=true&limit=700'),
        api<Poste[]>('/postes'),
        api<Camera[]>('/cameras'),
      ]);
      setCondominios(condominiosDoPainel(todos, listaPostes, listaCameras));
      setPostes(listaPostes);
      setCameras(listaCameras);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os postes. Puxe a tela para tentar de novo.');
    }
  }, []);

  // recarrega sempre que a aba volta ao foco (um poste pode ter sido editado na gestão)
  useFocusEffect(useCallback(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]));

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const grupos = useMemo(() => condominios.map(c => {
    const doCondominio = cameras.filter(cam => cam.condominio_id === c.id);
    const linhas = postes.filter(p => p.condominio_id === c.id).map(p => ({ poste: p, cameras: doCondominio.filter(cam => cam.poste_id === p.id) }));
    const emPoste = new Set(linhas.flatMap(l => l.cameras.map(cam => cam.id)));
    return { condominio: c, linhas, avulsas: doCondominio.filter(cam => !emPoste.has(cam.id)).length };
  }), [condominios, postes, cameras]);

  function estadoDoPoste(doPoste: Camera[]): { texto: string; tom: 'azul' | 'erro' | 'suave' } {
    if (doPoste.length === 0) return { texto: 'Sem câmera', tom: 'suave' };
    const sabidos = doPoste.filter(c => estadoDe(c) !== 'desconhecido');
    if (sabidos.length === 0) return { texto: 'Sem informação', tom: 'suave' };
    const fora = sabidos.filter(c => estadoDe(c) === 'offline').length;
    return fora > 0 ? { texto: `${fora} offline`, tom: 'erro' } : { texto: 'Tudo no ar', tom: 'azul' };
  }

  return (
    <View style={styles.tela}>
      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        <Saudacao titulo="Postes" />

        <View style={styles.corpo}>
          {erro && <Mensagem texto={erro} tom="erro" />}

          {carregando ? (
            <>
              <Esqueleto altura={componentes.cartao.alturaMin} />
              <Esqueleto altura={componentes.cartao.alturaMin} />
              <Esqueleto altura={componentes.cartao.alturaMin} />
            </>
          ) : grupos.length === 0 && !erro ? (
            <Mensagem texto="Nenhum poste liberado para você ainda. Fale com a CM Port para pedir acesso." />
          ) : (
            grupos.map(g => (
              <Bloco
                key={g.condominio.id}
                titulo={g.condominio.nome}
                acao="Abrir"
                aoTocar={() => router.push({ pathname: '/condominio/[id]', params: { id: String(g.condominio.id), nome: g.condominio.nome } })}
              >
                {g.linhas.map((l, i) => {
                  const estado = estadoDoPoste(l.cameras);
                  const n = l.cameras.length;
                  return (
                    <Entrada key={l.poste.id} ordem={i}>
                      <Cartao
                        onPress={() => router.push({ pathname: '/poste/[id]', params: { id: String(l.poste.id) } })}
                        rotulo={`Abrir o ${l.poste.nome}. ${estado.texto}.`}
                        style={styles.linha}
                      >
                        <IconeCaixa tom={estado.tom === 'erro' ? 'erro' : 'azul'}>
                          <GlifoPoste cor={estado.tom === 'erro' ? cores.erro : cores.azul} tamanho={componentes.iconeCaixa.glifo} />
                        </IconeCaixa>
                        <View style={styles.linhaTexto}>
                          <Text style={styles.nome} numberOfLines={2}>{l.poste.nome}</Text>
                          <Text style={styles.resumo}>{n === 0 ? 'Nenhuma câmera instalada' : `${n} ${n === 1 ? 'câmera' : 'câmeras'}`}</Text>
                        </View>
                        <Pilula texto={estado.texto} tom={estado.tom} />
                      </Cartao>
                    </Entrada>
                  );
                })}
                {g.avulsas > 0 && (
                  <Cartao
                    onPress={() => router.push({ pathname: '/condominio/[id]', params: { id: String(g.condominio.id), nome: g.condominio.nome } })}
                    rotulo={`Ver as câmeras fora de poste de ${g.condominio.nome}`}
                    style={styles.linha}
                  >
                    <IconeCaixa tom="suave">
                      <GlifoCameraAba cor={cores.textoSuave} tamanho={componentes.iconeCaixa.glifo} />
                    </IconeCaixa>
                    <View style={styles.linhaTexto}>
                      <Text style={styles.nome}>Fora de poste</Text>
                      <Text style={styles.resumo}>{g.avulsas} {g.avulsas === 1 ? 'câmera' : 'câmeras'}</Text>
                    </View>
                  </Cartao>
                )}
              </Bloco>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { paddingBottom: componentes.abas.reserva, width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center' },
  corpo: { paddingHorizontal: espaco[5], gap: espaco[6] },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], padding: espaco[3.5] },
  linhaTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nome, color: c.texto },
  resumo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
});
