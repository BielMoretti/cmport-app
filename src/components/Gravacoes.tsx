import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlifoAnterior, GlifoPausar, GlifoProximo, GlifoTocar } from '@/components/arte';
import { Toque } from '@/components/efeitos';
import GravacaoPlayer, { type ControlesDoPlayer } from '@/components/GravacaoPlayer';
import LinhaDoTempo from '@/components/LinhaDoTempo';
import MarcaDagua from '@/components/MarcaDagua';
import { Cartao, Esqueleto } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { agruparEventos, buscarGravacoes, pedirVideo, type Evento, type Trecho } from '@/lib/gravacoes';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, type Paleta } from '@/lib/tema';

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
  if (indice === 0) return 'Hoje';
  if (indice === 1) return 'Ontem';
  return dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace(/[.,]/g, '');
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const horaDe = (d: Date) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;

function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return 'O servidor não tem gravações desta câmera.';
  if (e instanceof ApiError && e.status === 410) return 'Essa gravação não está mais disponível (passou do prazo do plano).';
  if (e instanceof ApiError) return e.message;
  return 'Não foi possível buscar as gravações. Tente de novo.';
}

/**
 * Gravações de uma câmera, como no sistema web: o vídeo, os controles (voltar e
 * avançar 10 s, trecho anterior e próximo, velocidade), a barra do tempo do dia com
 * os movimentos marcados e zoom, e os eventos de movimento em miniaturas.
 */
export default function Gravacoes({ cameraId }: { cameraId: number }) {
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
  const [velocidade, setVelocidade] = useState(1);
  const [aviso, setAviso] = useState<string | null>(null);

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

  const tocar = useCallback(async (trecho: Trecho) => {
    if (!trecho.disponivel) {
      setAviso(`O trecho das ${horaDe(trecho.inicio)} já saiu do servidor e não está mais disponível.`);
      return;
    }
    setAviso(null);
    setAbrindo(true);
    try {
      // o link vale poucos minutos — por isso é pedido só na hora de assistir
      const link = await pedirVideo(cameraId, trecho.id);
      setPosicao(0);
      setAtual(trecho);
      setUrl(link);
    } catch (e) {
      setAviso(mensagemDeErro(e));
    } finally {
      setAbrindo(false);
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
    if (alvo) void tocar(alvo); else setAviso(`Não há gravação a partir das ${horaDe(momento)}.`);
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
  const cursor = atual ? new Date(atual.inicio.getTime() + posicao * 1000) : null;
  useEffect(() => {
    if (!cursor || zoom === 24) return;
    const t = cursor.getTime();
    if (t < inicioJanela || t > inicioJanela + zoom * HORA) setInicioJanela(prender(t - (zoom * HORA) / 4, zoom));
  }, [cursor, zoom, inicioJanela, prender]);

  const fimJanela = new Date(inicioJanela + zoom * HORA);
  const anterior = vizinho(-1);
  const proximo = vizinho(1);

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
            velocidade={velocidade}
            aoTerminar={emendar}
            aoAndar={setPosicao}
            aoMudarTocando={setTocando}
          />
        ) : (
          <View style={styles.palcoVazio}>
            <Text style={styles.palcoTexto}>
              {abrindo ? 'Abrindo a gravação…' : 'Toque na barra do tempo ou num evento para assistir.'}
            </Text>
          </View>
        )}
      </View>

      {cursor && <Text style={styles.agora}>Assistindo {dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às {horaDe(cursor)}:{doisDigitos(cursor.getSeconds())}</Text>}
      {aviso && <Text style={styles.erro} accessibilityRole="alert">{aviso}</Text>}

      {/* os controles */}
      <View style={styles.controles}>
        {botao('Trecho anterior', <GlifoAnterior cor={cores.texto} tamanho={componentes.glifo} />, () => { if (anterior) void tocar(anterior); }, !anterior || abrindo)}
        {botao('Voltar 10 segundos', <Text style={styles.controleTexto}>−10s</Text>, () => player.current?.pular(-10), !url)}
        {botao(
          tocando ? 'Pausar' : 'Tocar',
          tocando ? <GlifoPausar cor={cores.sobreLuz} tamanho={componentes.glifo} /> : <GlifoTocar cor={cores.sobreLuz} tamanho={componentes.glifo} />,
          () => { if (url) player.current?.alternar(); else if (fila[0]) void tocar(fila[0]); },
          abrindo || (!url && fila.length === 0),
          true,
        )}
        {botao('Avançar 10 segundos', <Text style={styles.controleTexto}>+10s</Text>, () => player.current?.pular(10), !url)}
        {botao('Próximo trecho', <GlifoProximo cor={cores.texto} tamanho={componentes.glifo} />, () => { if (proximo) void tocar(proximo); }, !proximo || abrindo)}
      </View>

      <View style={styles.linhaDeChips}>
        <Text style={styles.rotulo}>Velocidade</Text>
        {VELOCIDADES.map(v => (
          <Pressable
            key={v}
            onPress={() => setVelocidade(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: v === velocidade }}
            accessibilityLabel={`Velocidade ${v} vezes`}
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
            <Pressable onPress={() => setTentativa(t => t + 1)} accessibilityRole="button"><Text style={styles.link}>Tentar de novo</Text></Pressable>
          </View>
        ) : trechos.length === 0 ? (
          <Text style={styles.apoio}>Nenhuma gravação neste dia.</Text>
        ) : (
          <>
            <View style={styles.janela}>
              {zoom < 24 && (
                <Pressable onPress={() => deslizar(-1)} hitSlop={espaco[2]} accessibilityRole="button" accessibilityLabel="Ver mais cedo" style={styles.seta}>
                  <GlifoAnterior cor={cores.texto} tamanho={componentes.glifo - 4} />
                </Pressable>
              )}
              <Text style={styles.janelaTexto}>{horaDe(new Date(inicioJanela))} às {horaDe(new Date(fimJanela.getTime() - 60_000))}</Text>
              {zoom < 24 && (
                <Pressable onPress={() => deslizar(1)} hitSlop={espaco[2]} accessibilityRole="button" accessibilityLabel="Ver mais tarde" style={styles.seta}>
                  <GlifoProximo cor={cores.texto} tamanho={componentes.glifo - 4} />
                </Pressable>
              )}
            </View>

            <LinhaDoTempo trechos={trechos} inicio={new Date(inicioJanela)} fim={fimJanela} cursor={cursor} aoTocar={irPara} />

            <View style={styles.linhaDeChips}>
              <Text style={styles.rotulo}>Zoom</Text>
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
              <View style={[styles.amostra, styles.amostraGravado]} /><Text style={styles.legendaTexto}>Gravado</Text>
              <View style={[styles.amostra, styles.amostraMovimento]} /><Text style={styles.legendaTexto}>Movimento</Text>
              <View style={[styles.amostra, styles.amostraCursor]} /><Text style={styles.legendaTexto}>Você está aqui</Text>
            </View>
          </>
        )}
      </Cartao>

      {/* os eventos de movimento */}
      {!carregando && !erro && trechos.length > 0 && (
        <>
          <View style={styles.eventosCabeca}>
            <Text style={styles.titulo} accessibilityRole="header">Movimento no dia ({eventos.length})</Text>
            <Pressable
              onPress={() => setSoMovimento(v => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: soMovimento }}
              accessibilityLabel="Ao avançar, pular o que não teve movimento"
              style={[styles.chip, soMovimento && styles.chipAtivo]}
            >
              <Text style={[styles.chipTexto, soMovimento && styles.chipTextoAtivo]}>Só movimento</Text>
            </Pressable>
          </View>

          {eventos.length === 0 ? (
            <Text style={styles.apoio}>Nenhum movimento registrado neste dia.</Text>
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
        accessibilityLabel={`Assistir o movimento das ${horaDe(evento.inicio)} às ${horaDe(evento.fim)}, ${evento.minutos} ${evento.minutos === 1 ? 'minuto' : 'minutos'}`}
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
          <Text style={styles.eventoHora}>{horaDe(evento.inicio)} às {horaDe(evento.fim)}</Text>
          <Text style={styles.eventoDuracao}>{evento.minutos} min</Text>
        </View>
      </Toque>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  bloco: { gap: espaco[4] },
  palco: { borderRadius: raio.grande, overflow: 'hidden', borderWidth: 1, borderColor: c.linha, boxShadow: c.brilho },
  palcoVazio: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palco.fundo, alignItems: 'center', justifyContent: 'center', padding: espaco[6] },
  palcoTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: palco.texto, textAlign: 'center' },
  agora: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.texto, textAlign: 'center', fontVariant: ['tabular-nums'] },

  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaco[3] },
  controle: {
    width: componentes.controle.tamanho, height: componentes.controle.tamanho, borderRadius: componentes.controle.tamanho / 2,
    backgroundColor: c.superficie, borderWidth: 1, borderColor: c.linha, alignItems: 'center', justifyContent: 'center',
  },
  controlePrincipal: {
    width: componentes.controle.principal, height: componentes.controle.principal, borderRadius: componentes.controle.principal / 2,
    backgroundColor: c.luz, borderColor: c.luz, boxShadow: c.brilho,
  },
  controleTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.texto },
  desligado: { opacity: 0.4 },

  linhaDeChips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espaco[2] },
  rotulo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, marginRight: espaco[1] },
  chip: {
    borderRadius: raio.pilula, borderWidth: 1, borderColor: c.linha, backgroundColor: c.superficie,
    paddingHorizontal: espaco[3], minHeight: componentes.chip.altura, minWidth: componentes.chip.altura, alignItems: 'center', justifyContent: 'center',
  },
  chipAtivo: { backgroundColor: c.luz, borderColor: c.luz, boxShadow: c.brilho },
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
  evento: { backgroundColor: c.superficie, borderRadius: raio.medio, borderWidth: 1, borderColor: c.linha, overflow: 'hidden' },
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
