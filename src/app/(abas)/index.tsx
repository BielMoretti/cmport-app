import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Fundo, GlifoAlerta, GlifoCameraAba, GlifoPoste, GlifoSemSinal, GlifoSinal, Horizonte, Varredura, Veu } from '@/components/arte';
import { Monitor } from '@/components/central';
import { Entrada, Pulso } from '@/components/efeitos';
import MarcaDagua from '@/components/MarcaDagua';
import { Botao, Mensagem } from '@/components/formulario';
import { Bloco, Cartao, Esqueleto, IconeCaixa, Numero, Progresso, Saudacao } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { useAuth } from '@/contexts/AuthContext';
import { condominiosDoPainel, ehDemo, ehSindico, veDiagnostico, type CondominioDoPainel } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { urlAbsoluta } from '@/lib/config';
import { useFavoritas } from '@/lib/favoritas';
import { conferirForaDoAr, tempoForaDoAr, type CameraForaDoAr } from '@/lib/foraDoAr';
import { estadoDe } from '@/lib/saude';
import { avisosNovos, buscarMural, quando, type AvisoDoMural } from '@/lib/mural';
import { falarComACmPort } from '@/lib/suporte';
import { componentes, corpo, entrelinha, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import type { Camera, Condominio, Poste } from '@/lib/types';
import { tr } from '@/lib/idioma';

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
  const { usuario } = useAuth();
  const styles = useEstilos(criarEstilos);

  const [condominios, setCondominios] = useState<CondominioDoPainel[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // câmeras que este aparelho vê fora do ar há tempo suficiente para avisar
  const [foraDoAr, setForaDoAr] = useState<CameraForaDoAr[]>([]);
  // mural de avisos do condomínio: null = o servidor ainda não tem (o bloco não aparece)
  const [mural, setMural] = useState<AvisoDoMural[] | null>(null);
  const [avisosNaoLidos, setAvisosNaoLidos] = useState(0);
  // demonstração: só as câmeras; sem mural (o servidor recusa) e sem o aviso de "fora do ar há tanto tempo"
  const demo = ehDemo(usuario?.role);

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
      if (demo) return;
      setForaDoAr(await conferirForaDoAr(listaCameras));
      // o mural é um extra: se falhar, o Início continua inteiro
      const avisos = await buscarMural().catch(() => null);
      setMural(avisos);
      setAvisosNaoLidos(avisos ? await avisosNovos(avisos) : 0);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível carregar. Puxe a tela para tentar de novo.'));
    }
  }, [demo]);

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

  // as favoritas, na ordem em que foram marcadas; some a que saiu do ar da lista do servidor
  const { favoritas } = useFavoritas();
  const camerasFavoritas = favoritas.map(id => cameras.find(c => c.id === id)).filter((c): c is Camera => !!c);

  const online = cameras.filter(c => estadoDe(c) === 'online').length;
  const offline = cameras.filter(c => estadoDe(c) === 'offline').length;
  const consultadas = online + offline;

  const alertas = useMemo<Alerta[]>(() => {
    const abrir = (id: number) => () => router.push({ pathname: '/camera/[id]', params: { id: String(id) } });
    const lista: Alerta[] = [];
    for (const c of cameras) {
      if (estadoDe(c) === 'offline') lista.push({ chave: `off${c.id}`, grave: true, titulo: tr('{0} fora do ar', [c.nome]), detalhe: c.condominio_nome ?? tr('Sem vídeo chegando agora'), aoTocar: abrir(c.id) });
    }
    for (const c of cameras) {
      if (estadoDe(c) !== 'offline' && (c.saude === 'PROBLEMA' || c.saude === 'ATENCAO')) {
        lista.push({ chave: `saude${c.id}`, grave: c.saude === 'PROBLEMA', titulo: tr('{0}: vídeo {1}', [c.nome, c.saude === 'PROBLEMA' ? tr('com problema') : tr('instável')]), detalhe: c.condominio_nome ?? tr('Toque para ver o que ajustar'), aoTocar: abrir(c.id) });
      }
    }
    for (const p of postes) {
      if (p.total_cameras === 0) lista.push({ chave: `poste${p.id}`, grave: false, titulo: tr('{0} sem câmera', [p.nome]), detalhe: p.condominio_nome ?? tr('Poste sem nenhuma câmera'), aoTocar: () => router.push({ pathname: '/poste/[id]', params: { id: String(p.id) } }) });
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
              <Text style={styles.vazioTitulo}>{tr('Nenhuma câmera por aqui ainda')}</Text>
              <Text style={styles.apoio}>{tr('Quando a CM Port liberar um condomínio para você, as câmeras aparecem nesta tela.')}</Text>
            </Cartao>
          ) : cameras.length > 0 && (
            <>
              {/* 1. Está tudo no ar? */}
              <Entrada ordem={0}>
                <Cartao destaque onPress={() => router.push('/cameras')} rotulo={tr('Abrir as câmeras')}>
                  <Varredura altura={componentes.situacao.altura * 2} />
                  <Text style={styles.situacaoRotulo}>{tr('Câmeras no ar agora')}</Text>
                  <View style={styles.situacaoNumeros}>
                    <Text style={styles.situacaoGrande}>{consultadas > 0 ? online : '–'}</Text>
                    {consultadas > 0 && <Text style={styles.situacaoDe}>{tr('de ')}{consultadas}</Text>}
                  </View>
                  <View style={styles.situacaoLinha}>
                    <Pulso cor={offline > 0 ? cores.estadoOffline : cores.estadoOnline} tamanho={componentes.selo.ponto + 2} />
                    <Text style={styles.situacaoTitulo}>
                      {consultadas === 0 ? tr('O servidor não informou o estado das câmeras') : offline > 0 ? `${offline} ${offline === 1 ? tr('câmera fora do ar') : tr('câmeras fora do ar')}` : tr('Tudo no ar')}
                    </Text>
                  </View>
                  {consultadas > 0 && <Progresso fracao={online / consultadas} rotulo={tr('{0} de {1} câmeras online', [online, consultadas])} />}
                </Cartao>
              </Entrada>

              <Entrada ordem={1}>
                <View style={styles.numeros}>
                  <Numero icone={<GlifoCameraAba cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={cameras.length} legenda={cameras.length === 1 ? tr('câmera') : tr('câmeras')} />
                  <Numero icone={<GlifoSinal cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={online} legenda={tr('online')} />
                  <Numero icone={<GlifoSemSinal cor={offline > 0 ? cores.erro : cores.textoSuave} tamanho={componentes.iconeCaixa.glifo} />} valor={offline} legenda={tr('offline')} tom="erro" />
                  <Numero icone={<GlifoPoste cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={postes.length} legenda={postes.length === 1 ? tr('poste') : tr('postes')} />
                </View>
              </Entrada>

              {/* câmera fora do ar há um bom tempo: todo mundo vê, com o caminho para pedir ajuda */}
              {foraDoAr.length > 0 && (
                <Entrada ordem={2}>
                  <Cartao style={styles.fora}>
                    <View style={styles.foraCabeca}>
                      <IconeCaixa tom="erro">
                        <GlifoSemSinal cor={cores.erro} tamanho={componentes.iconeCaixa.glifo} />
                      </IconeCaixa>
                      <View style={styles.alertaTexto}>
                        <Text style={styles.alertaTitulo}>
                          {foraDoAr.length === 1
                            ? tr('{0} está fora do ar há {1}', [foraDoAr[0].camera.nome, tempoForaDoAr(foraDoAr[0].desde)])
                            : tr('{0} câmeras estão fora do ar há mais de 30 min', [foraDoAr.length])}
                        </Text>
                        <Text style={styles.alertaDetalhe}>
                          {foraDoAr.length === 1
                            ? foraDoAr[0].camera.condominio_nome ?? tr('Sem vídeo chegando agora')
                            : foraDoAr.slice(0, MAX_ALERTAS).map(f => `${f.camera.nome} (${tempoForaDoAr(f.desde)})`).join(', ') + (foraDoAr.length > MAX_ALERTAS ? '…' : '')}
                        </Text>
                      </View>
                    </View>
                    <Botao titulo={tr('Avisar a CM Port')} variante="secundario" onPress={() => {
                      void falarComACmPort(foraDoAr.length === 1
                        ? tr('Olá! A câmera {0} está fora do ar.', [foraDoAr[0].camera.nome])
                        : tr('Olá! Tenho {0} câmeras fora do ar.', [foraDoAr.length]));
                    }} />
                  </Cartao>
                </Entrada>
              )}

              {/* mural do condomínio: o aviso mais recente; o síndico entra para publicar */}
              {mural !== null && (mural.length > 0 || ehSindico(usuario?.role)) && (
                <Bloco
                  titulo={avisosNaoLidos > 0 ? tr('Mural de avisos ({0})', [avisosNaoLidos]) : tr('Mural de avisos')}
                  acao={mural.length > 1 ? tr('Ver {0}', [mural.length]) : ehSindico(usuario?.role) ? tr('Publicar') : undefined}
                  aoTocar={() => router.push('/mural')}
                >
                  <Cartao onPress={() => router.push('/mural')} rotulo={mural[0] ? tr('Abrir o mural. Último aviso: {0}', [mural[0].titulo]) : tr('Abrir o mural de avisos')} style={styles.muralCartao}>
                    {mural[0] ? (
                      <>
                        <Text style={styles.alertaTitulo} numberOfLines={2}>{mural[0].titulo}</Text>
                        <Text style={styles.alertaDetalhe} numberOfLines={1}>{[mural[0].autor_nome, quando(mural[0].criado_em)].join(' · ')}</Text>
                        <Text style={styles.muralTexto} numberOfLines={3}>{mural[0].texto}</Text>
                      </>
                    ) : (
                      <Text style={styles.muralTexto}>{tr('Nenhum aviso ainda. Toque para publicar o primeiro para os moradores.')}</Text>
                    )}
                  </Cartao>
                </Bloco>
              )}

              {/* as favoritas de quem está logado (estrela na tela da câmera) */}
              {camerasFavoritas.length > 0 && (
                <Bloco titulo={tr('Favoritas')}>
                  <View style={styles.favoritas}>
                    {camerasFavoritas.map(c => (
                      <View key={c.id} style={styles.favorita}>
                        <Monitor camera={c} onPress={() => router.push({ pathname: '/camera/[id]', params: { id: String(c.id) } })} />
                      </View>
                    ))}
                  </View>
                </Bloco>
              )}

              {/* 2. Tem algo pedindo atenção? */}
              {veDiagnostico(usuario?.role) && alertas.length > 0 && (
                <Bloco titulo={tr('Precisa de atenção')} acao={alertas.length > MAX_ALERTAS ? tr('Ver {0}', [alertas.length]) : undefined} aoTocar={() => router.push('/postes')}>
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
              <Bloco titulo={condominios.length === 1 ? tr('Seu condomínio') : tr('Seus condomínios')}>
                {/* um condomínio só: cartão da largura da tela, sem carrossel (dentro de um carrossel a
                    largura não tem limite, e o cartão saía da tela com a imagem cortada numa faixa) */}
                <Carrossel unico={condominios.length === 1} styles={styles}>
                  {condominios.map(c => (
                    <Cartao
                      key={c.id}
                      onPress={() => router.push({ pathname: '/condominio/[id]', params: { id: String(c.id), nome: c.nome } })}
                      rotulo={tr('Abrir {0}', [c.nome])}
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
                          {c.totalCameras} {c.totalCameras === 1 ? tr('câmera') : tr('câmeras')}{c.totalPostes > 0 ? `, ${c.totalPostes} ${c.totalPostes === 1 ? tr('poste') : tr('postes')}` : ''}
                        </Text>
                      </View>
                    </Cartao>
                  ))}
                </Carrossel>
              </Bloco>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Vários condomínios: carrossel que sangra até a borda. Um só: o cartão ocupa a largura. */
function Carrossel({ unico, styles, children }: { unico: boolean; styles: ReturnType<typeof criarEstilos>; children: ReactNode }) {
  if (unico) return <View>{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carrossel} style={styles.carrosselArea}>
      {children}
    </ScrollView>
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
  favoritas: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -espaco[1.5] },
  favorita: { width: '50%', padding: espaco[1.5] },

  fora: { gap: espaco[3.5], borderColor: c.erro },
  muralCartao: { gap: espaco[1.5] },
  muralTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  foraCabeca: { flexDirection: 'row', alignItems: 'center', gap: espaco[3] },
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
  // sozinho, ocupa a largura do conteúdo e fica na proporção da imagem da câmera (16:9)
  condominioUnico: { width: '100%', height: undefined, aspectRatio: 16 / 9 },
  condominioTexto: { padding: espaco[4], gap: espaco[0.5] },
  condominioNome: { fontFamily: fontes.nome, fontSize: corpo.nome, lineHeight: entrelinha.base, color: c.texto },
  condominioResumo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.azul },
});
