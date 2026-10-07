import { useCallback, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Fundo, GlifoAlerta, GlifoCameraAba, GlifoPoste, GlifoSemSinal, GlifoSinal, Horizonte, Varredura, Veu } from '@/components/arte';
import { Entrada, Pulso } from '@/components/efeitos';
import MarcaDagua from '@/components/MarcaDagua';
import { Mensagem } from '@/components/formulario';
import { Bloco, Cartao, Esqueleto, IconeCaixa, Numero, Progresso, Saudacao } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { condominiosDoPainel, type CondominioDoPainel } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { urlAbsoluta } from '@/lib/config';
import { estadoDe } from '@/lib/saude';
import { componentes, corpo, entrelinha, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import type { Camera, Condominio, Poste } from '@/lib/types';

const INTERVALO_MS = 30_000;
const MAX_ALERTAS = 3;

interface Alerta {
  chave: string;
  grave: boolean;
  titulo: string;
  detalhe: string;
  aoTocar: () => void;
}

/**
 * Início: três perguntas, uma por bloco — está tudo no ar? tem algo pedindo
 * atenção? quais são os meus condomínios? A parede de câmeras fica na aba Câmeras.
 */
export default function InicioScreen() {
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
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar. Puxe a tela para tentar de novo.');
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

  const online = cameras.filter(c => estadoDe(c) === 'online').length;
  const offline = cameras.filter(c => estadoDe(c) === 'offline').length;
  const consultadas = online + offline;

  const alertas = useMemo<Alerta[]>(() => {
    const abrir = (id: number) => () => router.push({ pathname: '/camera/[id]', params: { id: String(id) } });
    const lista: Alerta[] = [];
    for (const c of cameras) {
      if (estadoDe(c) === 'offline') lista.push({ chave: `off${c.id}`, grave: true, titulo: `${c.nome} fora do ar`, detalhe: c.condominio_nome ?? 'Sem vídeo chegando agora', aoTocar: abrir(c.id) });
    }
    for (const c of cameras) {
      if (estadoDe(c) !== 'offline' && (c.saude === 'PROBLEMA' || c.saude === 'ATENCAO')) {
        lista.push({ chave: `saude${c.id}`, grave: c.saude === 'PROBLEMA', titulo: `${c.nome}: vídeo ${c.saude === 'PROBLEMA' ? 'com problema' : 'instável'}`, detalhe: c.condominio_nome ?? 'Toque para ver o que ajustar', aoTocar: abrir(c.id) });
      }
    }
    for (const p of postes) {
      if (p.total_cameras === 0) lista.push({ chave: `poste${p.id}`, grave: false, titulo: `${p.nome} sem câmera`, detalhe: p.condominio_nome ?? 'Poste sem nenhuma câmera', aoTocar: () => router.push({ pathname: '/poste/[id]', params: { id: String(p.id) } }) });
    }
    return lista;
  }, [cameras, postes, router]);

  return (
    <View style={styles.tela}>

      <Fundo />
      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        <Saudacao />

        <View style={styles.corpo}>
          {erro && <Mensagem texto={erro} tom="erro" />}

          {carregando ? (
            <>
              <Esqueleto altura={componentes.situacao.altura * 2} />
              <Esqueleto altura={componentes.cartao.alturaMin} />
              <Esqueleto altura={componentes.cartaoDeCondominio.altura} />
            </>
          ) : cameras.length === 0 && !erro ? (
            <Cartao>
              <Text style={styles.vazioTitulo}>Nenhuma câmera por aqui ainda</Text>
              <Text style={styles.apoio}>Quando a CM Port liberar um condomínio para você, as câmeras aparecem nesta tela.</Text>
            </Cartao>
          ) : cameras.length > 0 && (
            <>
              {/* 1. Está tudo no ar? */}
              <Entrada ordem={0}>
                <Cartao destaque onPress={() => router.push('/cameras')} rotulo="Abrir as câmeras">
                  <Varredura altura={componentes.situacao.altura * 2} />
                  <Text style={styles.situacaoRotulo}>Câmeras no ar agora</Text>
                  <View style={styles.situacaoNumeros}>
                    <Text style={styles.situacaoGrande}>{consultadas > 0 ? online : '–'}</Text>
                    {consultadas > 0 && <Text style={styles.situacaoDe}>de {consultadas}</Text>}
                  </View>
                  <View style={styles.situacaoLinha}>
                    <Pulso cor={offline > 0 ? cores.estadoOffline : cores.estadoOnline} tamanho={componentes.selo.ponto + 2} />
                    <Text style={styles.situacaoTitulo}>
                      {consultadas === 0 ? 'O servidor não informou o estado das câmeras' : offline > 0 ? `${offline} ${offline === 1 ? 'câmera fora do ar' : 'câmeras fora do ar'}` : 'Tudo no ar'}
                    </Text>
                  </View>
                  {consultadas > 0 && <Progresso fracao={online / consultadas} rotulo={`${online} de ${consultadas} câmeras online`} />}
                </Cartao>
              </Entrada>

              <Entrada ordem={1}>
                <View style={styles.numeros}>
                  <Numero icone={<GlifoCameraAba cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={cameras.length} legenda={cameras.length === 1 ? 'câmera' : 'câmeras'} />
                  <Numero icone={<GlifoSinal cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={online} legenda="online" />
                  <Numero icone={<GlifoSemSinal cor={offline > 0 ? cores.erro : cores.textoSuave} tamanho={componentes.iconeCaixa.glifo} />} valor={offline} legenda="offline" tom="erro" />
                  <Numero icone={<GlifoPoste cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={postes.length} legenda={postes.length === 1 ? 'poste' : 'postes'} />
                </View>
              </Entrada>

              {/* 2. Tem algo pedindo atenção? */}
              {alertas.length > 0 && (
                <Bloco titulo="Precisa de atenção" acao={alertas.length > MAX_ALERTAS ? `Ver ${alertas.length}` : undefined} aoTocar={() => router.push('/postes')}>
                  {alertas.slice(0, MAX_ALERTAS).map((a, i) => (
                    <Entrada key={a.chave} ordem={i + 2}>
                      <Cartao onPress={a.aoTocar} rotulo={`${a.titulo}. ${a.detalhe}`} style={styles.alerta}>
                        <IconeCaixa tom={a.grave ? 'erro' : 'azul'}>
                          <GlifoAlerta cor={a.grave ? cores.erro : cores.azul} tamanho={componentes.iconeCaixa.glifo} />
                        </IconeCaixa>
                        <View style={styles.alertaTexto}>
                          <Text style={styles.alertaTitulo} numberOfLines={1}>{a.titulo}</Text>
                          <Text style={styles.alertaDetalhe} numberOfLines={1}>{a.detalhe}</Text>
                        </View>
                      </Cartao>
                    </Entrada>
                  ))}
                </Bloco>
              )}

              {/* 3. Quais são os meus condomínios? */}
              <Bloco titulo={condominios.length === 1 ? 'Seu condomínio' : 'Seus condomínios'}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carrossel} style={styles.carrosselArea}>
                  {condominios.map(c => (
                    <Cartao
                      key={c.id}
                      onPress={() => router.push({ pathname: '/condominio/[id]', params: { id: String(c.id), nome: c.nome } })}
                      rotulo={`Abrir ${c.nome}`}
                      style={[styles.condominio, condominios.length === 1 && styles.condominioUnico]}
                    >
                      {c.miniaturaUrl ? (
                        <>
                          <Image source={{ uri: urlAbsoluta(c.miniaturaUrl)! }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                          <MarcaDagua tamanho="pequena" />
                        </>
                      ) : (
                        <Horizonte semente={c.id} style={StyleSheet.absoluteFill} />
                      )}
                      <Veu cor={cores.veu} inicio={0.15} />
                      <View style={styles.condominioTexto}>
                        <Text style={styles.condominioNome} numberOfLines={2}>{c.nome}</Text>
                        <Text style={styles.condominioResumo}>
                          {c.totalCameras} {c.totalCameras === 1 ? 'câmera' : 'câmeras'}{c.totalPostes > 0 ? `, ${c.totalPostes} ${c.totalPostes === 1 ? 'poste' : 'postes'}` : ''}
                        </Text>
                      </View>
                    </Cartao>
                  ))}
                </ScrollView>
              </Bloco>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingBottom: componentes.abas.reserva, width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center' },
  corpo: { paddingHorizontal: espaco[5], gap: espaco[5] },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, marginTop: espaco[1], marginBottom: espaco[3] },

  situacaoRotulo: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
  situacaoNumeros: { flexDirection: 'row', alignItems: 'baseline', gap: espaco[2] },
  situacaoGrande: { fontFamily: fontes.nome, fontSize: componentes.estatistica.grande, lineHeight: componentes.estatistica.grande + espaco[2], color: c.texto, fontVariant: ['tabular-nums'] },
  situacaoDe: { fontFamily: fontes.texto, fontSize: corpo.cabecalho, color: c.textoSuave },
  situacaoLinha: { flexDirection: 'row', alignItems: 'center', gap: espaco[2.5], marginBottom: espaco[4] },
  situacaoTitulo: { flex: 1, fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
  vazioTitulo: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  numeros: { flexDirection: 'row', gap: espaco[2.5] },

  alerta: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], padding: espaco[3.5] },
  alertaTexto: { flex: 1, gap: espaco[0.5] },
  alertaTitulo: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto },
  alertaDetalhe: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },

  // o carrossel sangra até a borda da tela, mas o primeiro cartão começa alinhado ao resto
  carrosselArea: { marginHorizontal: -espaco[5] },
  carrossel: { paddingHorizontal: espaco[5], gap: espaco[3] },
  condominio: {
    width: componentes.cartaoDeCondominio.largura, height: componentes.cartaoDeCondominio.altura,
    justifyContent: 'flex-end', padding: 0, borderRadius: raio.grande,
  },
  condominioUnico: { width: componentes.conteudo.larguraMaxima - espaco[5] * 2, maxWidth: '100%' },
  condominioTexto: { padding: espaco[4], gap: espaco[0.5] },
  condominioNome: { fontFamily: fontes.nome, fontSize: corpo.nome, lineHeight: entrelinha.base, color: c.texto },
  condominioResumo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.azul },
});
