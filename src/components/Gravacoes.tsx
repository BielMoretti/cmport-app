import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlifoAnterior, GlifoBaixar, GlifoPausar, GlifoProximo, GlifoTocar } from '@/components/arte';
import BaixarGravacao from '@/components/BaixarGravacao';
import { Toque } from '@/components/efeitos';
import GravacaoPlayer, { type ControlesDoPlayer } from '@/components/GravacaoPlayer';
import LinhaDoTempo from '@/components/LinhaDoTempo';
import MarcaDagua from '@/components/MarcaDagua';
import { Cartao, Esqueleto } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { PODE_BAIXAR } from '@/components/Gravador';
import { agruparEventos, buscarGravacoes, pedirVideo, type Evento, type Trecho } from '@/lib/gravacoes';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, aceso, vidro, type Paleta } from '@/lib/tema';
import { localeAtual, tr } from '@/lib/idioma';

// O servidor guarda no máximo 7 dias no buffer local (recordDeleteAfter do MediaMTX)
const DIAS = 7;
const VELOCIDADES = [1, 2, 4, 8, 16];
const ZOOMS = [{ horas: 24, rotulo: '24 h' }, { horas: 6, rotulo: '6 h' }, { horas: 1, rotulo: '1 h' }, { horas: 0.25, rotulo: '15 min' }];
const HORA = 3_600_000;

function diasRecentes(): Date[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Array.from({ length: DIAS }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    return d;
  });
}

function rotuloDia(dia: Date, indice: number): string {
  if (indice === 0) return tr('Hoje');
  if (indice === 1) return tr('Ontem');
  return dia.toLocaleDateString(localeAtual(), { weekday: 'short', day: '2-digit' }).replace(/[.,]/g, '');
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const horaDe = (d: Date) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;

function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return tr('O servidor não tem gravações desta câmera.');
  if (e instanceof ApiError && e.status === 410) return tr('Essa gravação não está mais disponível (passou do prazo do plano).');
  if (e instanceof ApiError) return e.message;
  return tr('Não foi possível buscar as gravações. Tente de novo.');
}

/**
 * Gravações de uma câmera, como no sistema web: o vídeo, os controles (voltar e
 * avançar 10 s, trecho anterior e próximo, velocidade), a barra do tempo do dia com
 * os movimentos marcados e zoom, e os eventos de movimento em miniaturas.
 */
export default function Gravacoes({ cameraId, nomeDaCamera }: { cameraId: number; nomeDaCamera: string }) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const dias = useMemo(diasRecentes, []);
  const player = useRef<ControlesDoPlayer>(null);

  const [indiceDia, setIndiceDia] = useState(0);
  const [trechos, setTrechos] = useState<Trecho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [soMovimento, setSoMovimento] = useState(false);
  const [zoom, setZoom] = useState(24);                 // horas visíveis na barra
  const [inicioJanela, setInicioJanela] = useState(dias[0].getTime());

  const [atual, setAtual] = useState<Trecho | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [tocando, setTocando] = useState(false);
  const [posicao, setPosicao] = useState(0);            // segundos dentro do trecho
  const [comecarEm, setComecarEm] = useState(0);        // segundo do trecho onde o vídeo abre
  const [pendente, setPendente] = useState<number | null>(null);   // momento pedido, ainda carregando
  const pedido = useRef(0);                             // número do último pedido de vídeo
  const [velocidade, setVelocidade] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);
  const [janelaDeBaixar, setJanelaDeBaixar] = useState(false);

  const dia = dias[indiceDia];
  const comecoDoDia = dia.getTime();

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setAviso(null);
    setAtual(null);
    setUrl(null);
    setZoom(24);
    setInicioJanela(comecoDoDia);
    buscarGravacoes(cameraId, dia)
      .then(lista => { if (!cancelado) setTrechos(lista); })
      .catch(e => { if (!cancelado) { setTrechos([]); setErro(mensagemDeErro(e)); } })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [cameraId, dia, comecoDoDia, tentativa]);

  const eventos = useMemo(() => agruparEventos(trechos), [trechos]);
  // por onde "anterior", "próximo" e a emenda automática andam
  const fila = useMemo(() => trechos.filter(t => t.disponivel && (!soMovimento || t.movimento)), [trechos, soMovimento]);

  // `desdeSeg`: segundo dentro do trecho onde o vídeo começa (toque no meio de um minuto)
  const tocar = useCallback(async (trecho: Trecho, desdeSeg = 0) => {
    if (!trecho.disponivel) {
      setAviso(tr('O trecho das {0} já saiu do servidor e não está mais disponível.', [horaDe(trecho.inicio)]));
      return;
    }
    // Vários toques seguidos pedem vários links; só o último pedido vale. Sem isso, a resposta
    // mais lenta chegava por último e a barra voltava para um toque antigo.
    const meu = ++pedido.current;
    setAviso(null);
    setAbrindo(true);
    // a barra já mostra o destino enquanto o link vem, em vez de ficar parada no ponto antigo
    setPendente(trecho.inicio.getTime() + desdeSeg * 1000);
    try {
      // o link vale poucos minutos — por isso é pedido só na hora de assistir
      const link = await pedirVideo(cameraId, trecho.id);
      if (meu !== pedido.current) return;
      setPosicao(desdeSeg);
      setComecarEm(desdeSeg);
      setAtual(trecho);
      setUrl(link);
    } catch (e) {
      if (meu === pedido.current) setAviso(mensagemDeErro(e));
    } finally {
      if (meu === pedido.current) { setAbrindo(false); setPendente(null); }
    }
  }, [cameraId]);

  const vizinho = useCallback((passo: 1 | -1): Trecho | null => {
    if (!atual) return passo === 1 ? fila[0] ?? null : fila[fila.length - 1] ?? null;
    const t = atual.inicio.getTime();
    return passo === 1
      ? fila.find(x => x.inicio.getTime() > t) ?? null
      : [...fila].reverse().find(x => x.inicio.getTime() < t) ?? null;
  }, [atual, fila]);

  // acabou um trecho (~1 min): emenda no seguinte, como uma gravação contínua
  const emendar = useCallback(() => {
    const proximo = vizinho(1);
    if (proximo) void tocar(proximo); else setTocando(false);
  }, [vizinho, tocar]);

  // toque na barra: o trecho daquele momento ou, se ali não gravou, o primeiro depois
  const irPara = useCallback((momento: Date) => {
    const t = momento.getTime();
    const alvo = trechos.find(x => x.inicio.getTime() <= t && t < x.fim.getTime()) ?? trechos.find(x => x.inicio.getTime() > t);
    // dentro de um trecho, abre no segundo tocado; num vão, no começo do próximo
    if (alvo) void tocar(alvo, t > alvo.inicio.getTime() ? Math.floor((t - alvo.inicio.getTime()) / 1000) : 0);
    else setAviso(tr('Não há gravação a partir das {0}.', [horaDe(momento)]));
  }, [trechos, tocar]);

  // zoom: a janela nova fica centrada no vídeo (ou no meio da janela anterior), dentro do dia
  const prender = useCallback((inicio: number, horas: number) => Math.max(comecoDoDia, Math.min(inicio, comecoDoDia + 24 * HORA - horas * HORA)), [comecoDoDia]);
  const mudarZoom = (horas: number) => {
    const centro = atual ? atual.inicio.getTime() + posicao * 1000 : inicioJanela + (zoom * HORA) / 2;
    setZoom(horas);
    setInicioJanela(prender(centro - (horas * HORA) / 2, horas));
  };
  const deslizar = (sentido: 1 | -1) => setInicioJanela(prender(inicioJanela + sentido * (zoom * HORA) / 2, zoom));

  // com zoom, a janela acompanha o vídeo quando ele sai pela direita
  const cursor = pendente !== null ? new Date(pendente) : atual ? new Date(atual.inicio.getTime() + posicao * 1000) : null;
  useEffect(() => {
    if (!cursor || zoom === 24) return;
    const t = cursor.getTime();
    if (t < inicioJanela || t > inicioJanela + zoom * HORA) setInicioJanela(prender(t - (zoom * HORA) / 4, zoom));
  }, [cursor, zoom, inicioJanela, prender]);

  const sugestaoDeDownload = useMemo(() => {
    if (!atual) return null;
    const evento = eventos.find(e => atual.inicio >= e.inicio && atual.inicio < e.fim);
    return evento ? { de: evento.inicio, ate: evento.fim } : { de: atual.inicio, ate: atual.fim };
  }, [atual, eventos]);

  const fimJanela = new Date(inicioJanela + zoom * HORA);
  const anterior = vizinho(-1);
  const proximo = vizinho(1);

  // pular de movimento em movimento: a partir do evento que está tocando (ou do ponto do vídeo,
  // se ali não teve movimento); sem vídeo aberto, "próximo" é o primeiro movimento do dia
  const noEvento = atual ? eventos.findIndex(e => atual.inicio >= e.inicio && atual.inicio < e.fim) : -1;
  const agoraMs = cursor?.getTime() ?? null;
  const movimentoAnterior = noEvento >= 0
    ? eventos[noEvento - 1] ?? null
    : agoraMs === null ? null : [...eventos].reverse().find(e => e.fim.getTime() <= agoraMs) ?? null;
  const proximoMovimento = noEvento >= 0
    ? eventos[noEvento + 1] ?? null
    : agoraMs === null ? eventos[0] ?? null : eventos.find(e => e.inicio.getTime() > agoraMs) ?? null;
  const tocarMovimento = (evento: Evento | null) => {
    if (!evento) return;
    // o primeiro minuto pode já ter saído do servidor: começa pelo primeiro que ainda existe
    const trecho = evento.primeiro.disponivel ? evento.primeiro
      : trechos.find(x => x.disponivel && x.inicio >= evento.inicio && x.inicio < evento.fim);
    if (trecho) void tocar(trecho);
    else setAviso(tr('O movimento das {0} já saiu do servidor e não está mais disponível.', [horaDe(evento.inicio)]));
  };

  const botao = (rotulo: string, conteudo: ReactNode, aoTocar: () => void, desligado: boolean, principal = false) => (
    <Toque
      onPress={aoTocar}
      disabled={desligado}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      style={[styles.controle, principal && styles.controlePrincipal, desligado && styles.desligado]}
    >
      {conteudo}
    </Toque>
  );

  return (
    <View style={styles.bloco}>
      {/* o vídeo */}
      <View style={styles.palco}>
        {url && atual ? (
          <GravacaoPlayer
            key={url}
            ref={player}
            url={url}
            comecarEm={comecarEm}
            velocidade={velocidade}
            aoTerminar={emendar}
            aoAndar={setPosicao}
            aoMudarTocando={setTocando}
          />
        ) : (
          <View style={styles.palcoVazio}>
            <Text style={styles.palcoTexto}>
              {abrindo ? tr('Abrindo a gravação…') : tr('Toque na barra do tempo ou num evento para assistir.')}
            </Text>
          </View>
        )}
      </View>

      {cursor && <Text style={styles.agora}>{tr('Assistindo ')}{dia.toLocaleDateString(localeAtual(), { day: '2-digit', month: '2-digit' })} {tr('às ')}{horaDe(cursor)}:{doisDigitos(cursor.getSeconds())}</Text>}
      {aviso && <Text style={styles.erro} accessibilityRole="alert">{aviso}</Text>}

      {/* baixar: abre a janela para escolher de que horas a que horas */}
      {!carregando && trechos.some(x => x.disponivel) && (
        PODE_BAIXAR ? (
          <Toque onPress={() => setJanelaDeBaixar(true)} accessibilityRole="button" accessibilityLabel={tr('Baixar gravação: escolher o horário')} style={styles.baixar}>
            <GlifoBaixar cor={cores.texto} tamanho={componentes.glifo} />
            <Text style={styles.baixarTexto}>{tr('Baixar gravação')}</Text>
          </Toque>
        ) : (
          <Text style={styles.apoio}>{tr('Este navegador não consegue preparar o vídeo para baixar. Use o Chrome ou o Edge atualizados.')}</Text>
        )
      )}
      <BaixarGravacao
        visivel={janelaDeBaixar}
        aoFechar={() => setJanelaDeBaixar(false)}
        cameraId={cameraId}
        nomeDaCamera={nomeDaCamera}
        dia={dia}
        trechos={trechos}
        sugestao={sugestaoDeDownload}
      />

      {/* os controles */}
      <View style={styles.controles}>
        {botao(tr('Trecho anterior'), <GlifoAnterior cor={cores.texto} tamanho={componentes.glifo} />, () => { if (anterior) void tocar(anterior); }, !anterior || abrindo)}
        {botao(tr('Voltar 10 segundos'), <Text style={styles.controleTexto}>−10s</Text>, () => player.current?.pular(-10), !url)}
        {botao(
          tocando ? tr('Pausar') : tr('Tocar'),
          tocando ? <GlifoPausar cor={cores.sobreLuz} tamanho={componentes.glifo} /> : <GlifoTocar cor={cores.sobreLuz} tamanho={componentes.glifo} />,
          () => { if (url) player.current?.alternar(); else if (fila[0]) void tocar(fila[0]); },
          abrindo || (!url && fila.length === 0),
          true,
        )}
        {botao(tr('Avançar 10 segundos'), <Text style={styles.controleTexto}>+10s</Text>, () => player.current?.pular(10), !url)}
        {botao(tr('Próximo trecho'), <GlifoProximo cor={cores.texto} tamanho={componentes.glifo} />, () => { if (proximo) void tocar(proximo); }, !proximo || abrindo)}
      </View>

      {/* pular de movimento em movimento: anterior · onde está · próximo, numa linha */}
      {eventos.length > 0 && (
        <View style={styles.pular}>
          <Toque
            onPress={() => tocarMovimento(movimentoAnterior)}
            disabled={!movimentoAnterior || abrindo}
            accessibilityRole="button"
            accessibilityLabel={movimentoAnterior ? tr('Movimento anterior, às {0}', [horaDe(movimentoAnterior.inicio)]) : tr('Movimento anterior')}
            style={[styles.chip, styles.pularBotao, (!movimentoAnterior || abrindo) && styles.desligado]}
          >
            <GlifoAnterior cor={cores.texto} tamanho={componentes.glifo - 4} />
            <Text style={styles.pularTexto}>{tr('Anterior')}</Text>
          </Toque>
          <Text style={styles.pularContagem} accessibilityLiveRegion="polite">
            {noEvento >= 0
              ? tr('Movimento {0} de {1}', [noEvento + 1, eventos.length])
              : eventos.length === 1 ? tr('1 movimento') : tr('{0} movimentos', [eventos.length])}
          </Text>
          <Toque
            onPress={() => tocarMovimento(proximoMovimento)}
            disabled={!proximoMovimento || abrindo}
            accessibilityRole="button"
            accessibilityLabel={proximoMovimento ? tr('Próximo movimento, às {0}', [horaDe(proximoMovimento.inicio)]) : tr('Próximo movimento')}
            style={[styles.chip, styles.pularBotao, (!proximoMovimento || abrindo) && styles.desligado]}
          >
            <Text style={styles.pularTexto}>{atual ? tr('Próximo') : tr('Primeiro')}</Text>
            <GlifoProximo cor={cores.texto} tamanho={componentes.glifo - 4} />
          </Toque>
        </View>
      )}

      <View style={styles.linhaDeChips}>
        <Text style={styles.rotulo}>{tr('Velocidade')}</Text>
        {VELOCIDADES.map(v => (
          <Pressable
            key={v}
            onPress={() => setVelocidade(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: v === velocidade }}
            accessibilityLabel={tr('Velocidade {0} vezes', [v])}
            style={[styles.chip, v === velocidade && styles.chipAtivo]}
          >
            <Text style={[styles.chipTexto, v === velocidade && styles.chipTextoAtivo]}>{v}×</Text>
          </Pressable>
        ))}
      </View>

      {/* a barra do tempo */}
      <Cartao style={styles.cartaoDaBarra}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dias}>
          {dias.map((d, i) => (
            <Pressable
              key={d.getTime()}
              onPress={() => setIndiceDia(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: i === indiceDia }}
              style={[styles.chip, i === indiceDia && styles.chipAtivo]}
            >
              <Text style={[styles.chipTexto, i === indiceDia && styles.chipTextoAtivo]}>{rotuloDia(d, i)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {carregando ? (
          <Esqueleto altura={componentes.linhaDoTempo.altura} />
        ) : erro ? (
          <View style={styles.mensagem}>
            <Text style={styles.erro} accessibilityRole="alert">{erro}</Text>
            <Pressable onPress={() => setTentativa(t => t + 1)} accessibilityRole="button"><Text style={styles.link}>{tr('Tentar de novo')}</Text></Pressable>
          </View>
        ) : trechos.length === 0 ? (
          <Text style={styles.apoio}>{tr('Nenhuma gravação neste dia.')}</Text>
        ) : (
          <>
            <View style={styles.janela}>
              {zoom < 24 && (
                <Pressable onPress={() => deslizar(-1)} hitSlop={espaco[2]} accessibilityRole="button" accessibilityLabel={tr('Ver mais cedo')} style={styles.seta}>
                  <GlifoAnterior cor={cores.texto} tamanho={componentes.glifo - 4} />
                </Pressable>
              )}
              <Text style={styles.janelaTexto}>{horaDe(new Date(inicioJanela))} {tr('às ')}{horaDe(new Date(fimJanela.getTime() - 60_000))}</Text>
              {zoom < 24 && (
                <Pressable onPress={() => deslizar(1)} hitSlop={espaco[2]} accessibilityRole="button" accessibilityLabel={tr('Ver mais tarde')} style={styles.seta}>
                  <GlifoProximo cor={cores.texto} tamanho={componentes.glifo - 4} />
                </Pressable>
              )}
            </View>

            <LinhaDoTempo trechos={trechos} inicio={new Date(inicioJanela)} fim={fimJanela} cursor={cursor} aoTocar={irPara} />

            <View style={styles.linhaDeChips}>
              <Text style={styles.rotulo}>{tr('Zoom')}</Text>
              {ZOOMS.map(z => (
                <Pressable
                  key={z.horas}
                  onPress={() => mudarZoom(z.horas)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: z.horas === zoom }}
                  style={[styles.chip, z.horas === zoom && styles.chipAtivo]}
                >
                  <Text style={[styles.chipTexto, z.horas === zoom && styles.chipTextoAtivo]}>{z.rotulo}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.legenda}>
              <View style={[styles.amostra, styles.amostraGravado]} /><Text style={styles.legendaTexto}>{tr('Gravado')}</Text>
              <View style={[styles.amostra, styles.amostraMovimento]} /><Text style={styles.legendaTexto}>{tr('Movimento')}</Text>
              <View style={[styles.amostra, styles.amostraCursor]} /><Text style={styles.legendaTexto}>{tr('Você está aqui')}</Text>
            </View>
          </>
        )}
      </Cartao>

      {/* os eventos de movimento */}
      {!carregando && !erro && trechos.length > 0 && (
        <>
          <View style={styles.eventosCabeca}>
            <Text style={styles.titulo} accessibilityRole="header">{tr('Movimento no dia (')}{eventos.length})</Text>
            <Pressable
              onPress={() => setSoMovimento(v => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: soMovimento }}
              accessibilityLabel={tr('Ao avançar, pular o que não teve movimento')}
              style={[styles.chip, soMovimento && styles.chipAtivo]}
            >
              <Text style={[styles.chipTexto, soMovimento && styles.chipTextoAtivo]}>{tr('Só movimento')}</Text>
            </Pressable>
          </View>

          {eventos.length === 0 ? (
            <Text style={styles.apoio}>{tr('Nenhum movimento registrado neste dia.')}</Text>
          ) : (
            <View style={styles.eventos}>
              {eventos.map(e => <CartaoDeEvento key={e.primeiro.id} evento={e} ativo={!!atual && atual.inicio >= e.inicio && atual.inicio < e.fim} aoTocar={() => { void tocar(e.primeiro); }} />)}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function CartaoDeEvento({ evento, ativo, aoTocar }: { evento: Evento; ativo: boolean; aoTocar: () => void }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.eventoCaixa}>
      <Toque
        onPress={aoTocar}
        brilho
        accessibilityRole="button"
        accessibilityLabel={tr('Assistir o movimento das {0} às {1}, {2} {3}', [horaDe(evento.inicio), horaDe(evento.fim), evento.minutos, evento.minutos === 1 ? tr('minuto') : tr('minutos')])}
        style={[styles.evento, ativo && styles.eventoAtivo]}
      >
        <View style={styles.eventoFoto}>
          {evento.primeiro.miniaturaUrl && (
            <>
              <Image source={{ uri: evento.primeiro.miniaturaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
              <MarcaDagua tamanho="pequena" />
            </>
          )}
        </View>
        <View style={styles.eventoTexto}>
          <Text style={styles.eventoHora}>{horaDe(evento.inicio)} {tr('às ')}{horaDe(evento.fim)}</Text>
          <Text style={styles.eventoDuracao}>{evento.minutos} {tr('min')}</Text>
        </View>
      </Toque>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  bloco: { gap: espaco[4] },
  palco: { borderRadius: raio.grande, overflow: 'hidden', borderWidth: 1, borderColor: c.vidroBorda, boxShadow: c.vidroSombra },
  baixar: {
    ...vidro(c, 'forte'), borderRadius: raio.pilula, minHeight: componentes.botao.altura - espaco[1.5],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaco[2.5], paddingHorizontal: espaco[5],
  },
  baixarTexto: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto, fontVariant: ['tabular-nums'] },
  palcoVazio: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo, alignItems: 'center', justifyContent: 'center', padding: espaco[6] },
  palcoTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: palco.texto, textAlign: 'center' },
  agora: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.texto, textAlign: 'center', fontVariant: ['tabular-nums'] },

  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaco[3] },
  controle: {
    width: componentes.controle.tamanho, height: componentes.controle.tamanho, borderRadius: componentes.controle.tamanho / 2,
    ...vidro(c, 'forte'), alignItems: 'center', justifyContent: 'center',
  },
  controlePrincipal: {
    width: componentes.controle.principal, height: componentes.controle.principal, borderRadius: componentes.controle.principal / 2,
    ...aceso(c), borderColor: c.luz,
  },
  controleTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.texto },
  desligado: { opacity: 0.4 },

  pular: { flexDirection: 'row', alignItems: 'center', gap: espaco[2] },
  pularBotao: { flexDirection: 'row', gap: espaco[2], minHeight: componentes.alvoDeToque },
  pularTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.texto },
  pularContagem: { flex: 1, fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave, textAlign: 'center' },

  linhaDeChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espaco[2] },
  rotulo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, marginRight: espaco[1] },
  chip: {
    borderRadius: raio.pilula, ...vidro(c),
    paddingHorizontal: espaco[3], minHeight: componentes.chip.altura, minWidth: componentes.chip.altura, alignItems: 'center', justifyContent: 'center',
  },
  chipAtivo: { ...aceso(c), borderColor: c.luz },
  chipTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave },
  chipTextoAtivo: { color: c.sobreLuz },

  cartaoDaBarra: { gap: espaco[3], padding: espaco[4] },
  dias: { gap: espaco[2] },
  janela: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaco[3] },
  janelaTexto: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.texto, fontVariant: ['tabular-nums'] },
  seta: {
    width: componentes.chip.altura, height: componentes.chip.altura, borderRadius: componentes.chip.altura / 2,
    borderWidth: 1, borderColor: c.linha, alignItems: 'center', justifyContent: 'center',
  },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espaco[1.5] },
  amostra: { width: espaco[3], height: espaco[3], borderRadius: espaco[1] },
  amostraGravado: { backgroundColor: c.linha },
  amostraMovimento: { backgroundColor: c.luz },
  amostraCursor: { backgroundColor: c.texto, width: espaco[1] },
  legendaTexto: { fontFamily: fontes.texto, fontSize: corpo.micro, color: c.textoSuave, marginRight: espaco[2] },

  eventosCabeca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco[3] },
  titulo: { flex: 1, fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  eventos: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -espaco[1.5] },
  eventoCaixa: { width: '50%', padding: espaco[1.5] },
  evento: { ...vidro(c), borderRadius: raio.medio, overflow: 'hidden' },
  eventoAtivo: { borderColor: c.luz, boxShadow: c.brilho },
  eventoFoto: { width: '100%', aspectRatio: 16 / 9, backgroundColor: c.predio },
  eventoTexto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaco[2.5], paddingVertical: espaco[2] },
  eventoHora: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.texto, fontVariant: ['tabular-nums'] },
  eventoDuracao: { fontFamily: fontes.texto, fontSize: corpo.micro, color: c.azul },

  mensagem: { gap: espaco[2] },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.erro },
  link: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },
});
