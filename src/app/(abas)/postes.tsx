import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { BarraCarregando } from '@/components/efeitos';
import { Mensagem, Selo, Total } from '@/components/formulario';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { condominiosDoPainel } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { buscarEstados, type Estado } from '@/lib/saude';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera, Condominio, Poste } from '@/lib/types';

interface LinhaPoste {
  poste: Poste;
  cameras: Camera[];
}

interface Secao {
  title: string;
  condominioId: number;
  avulsas: number;
  data: LinhaPoste[];
}

/** Painel coletivo: todos os postes de todos os condomínios do usuário, com o estado de cada um. */
export default function PainelDePostesScreen() {
  const router = useRouter();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [estados, setEstados] = useState<Map<number, Estado>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [todos, listaPostes] = await Promise.all([
        api<Condominio[]>('/condominios?tipo=CONDOMINIO&ativo=true&limit=700'),
        api<Poste[]>('/postes'),
      ]);
      const doUsuario = condominiosDoPainel(todos, listaPostes);
      const ids = new Set(doUsuario.map(c => c.id));
      const porCondominio = await Promise.all(doUsuario.map(c => api<Camera[]>(`/cameras/por-condominio/${c.id}`)));
      const todasCameras = porCondominio.flat();
      setCondominios(doUsuario);
      setPostes(listaPostes.filter(p => ids.has(p.condominio_id)));
      setCameras(todasCameras);
      // o estado de conexão chega depois — a lista não espera por ele
      buscarEstados(todasCameras.map(c => c.id)).then(setEstados).catch(() => {});
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os postes. Puxe a tela para tentar de novo.');
    }
  }, []);

  // recarrega sempre que a aba volta ao foco (um poste pode ter sido editado na administração)
  useFocusEffect(useCallback(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]));

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const secoes = useMemo<Secao[]>(() => condominios.map(c => {
    const doCondominio = cameras.filter(cam => cam.condominio_id === c.id);
    const linhas = postes
      .filter(p => p.condominio_id === c.id)
      .map(p => ({ poste: p, cameras: doCondominio.filter(cam => cam.poste_id === p.id) }));
    const emPoste = new Set(linhas.flatMap(l => l.cameras.map(cam => cam.id)));
    return { title: c.nome, condominioId: c.id, avulsas: doCondominio.filter(cam => !emPoste.has(cam.id)).length, data: linhas };
  }), [condominios, postes, cameras]);

  const conhecidos = cameras.filter(c => (estados.get(c.id) ?? 'desconhecido') !== 'desconhecido');
  const online = conhecidos.filter(c => estados.get(c.id) === 'online').length;
  const semCamera = postes.filter(p => p.total_cameras === 0).length;

  function resumoDoPoste(linha: LinhaPoste): { texto: string; alerta: boolean } {
    const n = linha.cameras.length;
    if (n === 0) return { texto: 'Nenhuma câmera', alerta: true };
    const sabidos = linha.cameras.filter(c => (estados.get(c.id) ?? 'desconhecido') !== 'desconhecido');
    const base = `${n} ${n === 1 ? 'câmera' : 'câmeras'}`;
    if (sabidos.length === 0) return { texto: base, alerta: false };
    const on = sabidos.filter(c => estados.get(c.id) === 'online').length;
    return { texto: `${base}, ${on} online`, alerta: on < sabidos.length };
  }

  return (
    <View style={styles.tela}>
      <BarraCarregando ativa={carregando} />

      <SectionList
        sections={carregando ? [] : secoes}
        keyExtractor={item => String(item.poste.id)}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>Todos os postes</Text>
            <Text style={styles.apoio}>O que está instalado em cada condomínio e como está a conexão das câmeras.</Text>
            {erro && <Mensagem texto={erro} tom="erro" />}
            {!carregando && !erro && (
              <>
                <View style={styles.totais}>
                  <Total valor={String(postes.length)} legenda={postes.length === 1 ? 'poste' : 'postes'} />
                  <Total valor={String(cameras.length)} legenda={cameras.length === 1 ? 'câmera' : 'câmeras'} />
                  <Total valor={conhecidos.length > 0 ? `${online}/${conhecidos.length}` : '–'} legenda="online" />
                  <Total valor={String(semCamera)} legenda="sem câmera" />
                </View>
                {cameras.length > 0 && conhecidos.length === 0 && (
                  <Mensagem texto="O servidor ainda não informa ao app quais câmeras estão online." />
                )}
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          !carregando && !erro ? <Mensagem texto="Nenhum poste liberado para você ainda. Fale com a CM Port para pedir acesso." /> : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.condominio} accessibilityRole="header">{section.title}</Text>
        )}
        renderSectionFooter={({ section }) =>
          section.avulsas > 0 ? (
            <Pressable
              onPress={() => router.push({ pathname: '/condominio/[id]', params: { id: String(section.condominioId), nome: section.title } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.linha, styles.linhaAvulsa, pressed && styles.linhaPressionada]}
            >
              <Text style={styles.avulsas}>
                Fora de poste: {section.avulsas} {section.avulsas === 1 ? 'câmera' : 'câmeras'}
              </Text>
              <Text style={styles.acao}>Ver</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const resumo = resumoDoPoste(item);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/poste/[id]', params: { id: String(item.poste.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`Abrir o painel do ${item.poste.nome}`}
              style={({ pressed }) => [styles.linha, pressed && styles.linhaPressionada]}
            >
              <View style={styles.trilho} />
              <View style={styles.linhaTexto}>
                <Text style={styles.posteNome} numberOfLines={1}>{item.poste.nome}</Text>
                <Text style={styles.posteResumo}>{resumo.texto}</Text>
              </View>
              {resumo.alerta && <Selo texto="Atenção" tom="erro" />}
              <Text style={styles.acao}>Abrir</Text>
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
  cabecalho: { paddingHorizontal: espaco[4], paddingTop: espaco[2], gap: espaco[2] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.destaque, lineHeight: entrelinha.destaque, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  totais: { flexDirection: 'row', gap: espaco[2], marginTop: espaco[2] },

  condominio: {
    fontFamily: fontes.nome, fontSize: corpo.nomeGrande, lineHeight: entrelinha.base, color: c.texto,
    paddingHorizontal: espaco[4], paddingTop: espaco[6], paddingBottom: espaco[2],
  },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin + espaco[2],
    marginHorizontal: espaco[4], marginBottom: espaco[2], paddingRight: espaco[4],
    backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha, overflow: 'hidden',
  },
  linhaAvulsa: { paddingLeft: espaco[4], justifyContent: 'space-between' },
  linhaPressionada: { borderColor: c.azul, boxShadow: c.brilho },
  trilho: { width: componentes.poste.trilho, alignSelf: 'stretch', backgroundColor: c.luz },
  linhaTexto: { flex: 1, paddingVertical: espaco[3], gap: espaco[0.5] },
  posteNome: { fontFamily: fontes.nome, fontSize: corpo.nome, color: c.texto },
  posteResumo: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
  avulsas: { flex: 1, fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave },
  acao: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },
});
