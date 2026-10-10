import { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type GestureResponderEvent, type PointerEvent } from 'react-native';

import { useEstilos } from '@/contexts/TemaContext';
import type { Trecho } from '@/lib/gravacoes';
import { componentes, corpo, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import { tr } from '@/lib/idioma';

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const hora = (d: Date) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;

/** De quanto em quanto tempo vai um rótulo embaixo da barra, conforme a largura da janela. */
function passoDosRotulos(janelaMs: number): number {
  const h = janelaMs / 3_600_000;
  if (h > 12) return 6 * 3_600_000;
  if (h > 3) return 2 * 3_600_000;
  if (h > 0.5) return 20 * 60_000;
  return 5 * 60_000;
}

// No navegador: sem isso o arrasto rola a página ou seleciona texto em vez de mexer na barra
const SO_NA_WEB = Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'pointer', userSelect: 'none' } as object) : null;

/**
 * A barra do tempo das gravações: a faixa clara é onde há gravação, os traços
 * azuis são os minutos com movimento e o traço branco é onde o vídeo está agora.
 *
 * Arrastar o dedo (ou o mouse) pela barra mostra o horário sob o dedo; ao soltar,
 * o vídeo vai para lá. Um toque simples faz o mesmo de uma vez.
 */
export default function LinhaDoTempo({
  trechos, inicio, fim, cursor, aoTocar,
}: { trechos: Trecho[]; inicio: Date; fim: Date; cursor: Date | null; aoTocar: (momento: Date) => void }) {
  const styles = useEstilos(criarEstilos);
  const barra = useRef<View>(null);
  // posição da barra na tela — é com ela que o toque vira horário
  const medida = useRef({ x: 0, largura: 0 });
  const [largura, setLargura] = useState(0);
  const [previa, setPrevia] = useState<number | null>(null);   // horário sob o dedo durante o arrasto
  const arrastando = useRef(false);

  const t0 = inicio.getTime();
  const janela = fim.getTime() - t0;
  const fracao = (ms: number) => Math.max(0, Math.min(1, (ms - t0) / janela));

  const medir = (depois?: () => void) => {
    barra.current?.measureInWindow((x, _y, l) => {
      if (l > 0) medida.current = { x, largura: l };
      depois?.();
    });
  };

  // o horário que corresponde à posição do toque na tela (só o último minuto fica de fora)
  const momentoDe = (xNaTela: number): number | null => {
    const { x, largura: l } = medida.current;
    if (l <= 0) return null;
    const f = Math.max(0, Math.min(1, (xNaTela - x) / l));
    return Math.min(t0 + f * janela, t0 + janela - 1000);
  };

  const comecar = (xNaTela: number) => {
    arrastando.current = true;
    // mede de novo no começo de cada gesto: a tela pode ter rolado ou mudado de tamanho
    medir(() => { if (arrastando.current) setPrevia(momentoDe(xNaTela)); });
    setPrevia(momentoDe(xNaTela));
  };
  const mover = (xNaTela: number) => { if (arrastando.current) setPrevia(momentoDe(xNaTela)); };
  const soltar = (xNaTela: number) => {
    if (!arrastando.current) return;
    arrastando.current = false;
    const destino = momentoDe(xNaTela);
    setPrevia(null);
    if (destino !== null) aoTocar(new Date(destino));
  };
  const cancelar = () => { arrastando.current = false; setPrevia(null); };

  // Dois caminhos pro mesmo gesto. No navegador, eventos de ponteiro com captura (o sistema de
  // toque do React Native não entrega o movimento do mouse); no celular, o sistema de toque
  // nativo, com a barra segurando o gesto mesmo dentro da tela que rola na vertical.
  const gestos = Platform.OS === 'web'
    ? {
        onPointerDown: (e: PointerEvent) => {
          (e.currentTarget as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.nativeEvent.pointerId);
          comecar(e.nativeEvent.clientX);
        },
        onPointerMove: (e: PointerEvent) => mover(e.nativeEvent.clientX),
        onPointerUp: (e: PointerEvent) => soltar(e.nativeEvent.clientX),
        onPointerCancel: cancelar,
      }
    : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => false,
        onResponderGrant: (e: GestureResponderEvent) => comecar(e.nativeEvent.pageX),
        onResponderMove: (e: GestureResponderEvent) => mover(e.nativeEvent.pageX),
        onResponderRelease: (e: GestureResponderEvent) => soltar(e.nativeEvent.pageX),
        onResponderTerminate: cancelar,
      };

  // gravação contínua vira uma faixa só (um dia tem até 1440 trechos; faixas são poucas)
  const { faixas, movimentos } = useMemo(() => {
    const faixas: { de: number; ate: number }[] = [];
    const movimentos: { de: number; ate: number; id: number }[] = [];
    for (const t of trechos) {
      const de = t.inicio.getTime();
      const ate = t.fim.getTime();
      if (ate <= t0 || de >= t0 + janela) continue;
      const ultima = faixas[faixas.length - 1];
      if (ultima && de - ultima.ate <= 1500) ultima.ate = ate; else faixas.push({ de, ate });
      if (t.movimento) movimentos.push({ de, ate, id: t.id });
    }
    return { faixas, movimentos };
  }, [trechos, t0, janela]);

  const rotulos = useMemo(() => {
    const passo = passoDosRotulos(janela);
    // alinhados à meia-noite local do dia (06:00, 12:00…), não ao começo da janela
    const meiaNoite = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime();
    const lista: Date[] = [];
    for (let t = meiaNoite + Math.ceil((t0 - meiaNoite) / passo) * passo; t <= t0 + janela; t += passo) lista.push(new Date(t));
    // os das pontas ficariam cortados pela borda; a janela já é dita por extenso acima da barra
    return lista.filter(d => d.getTime() > t0 && d.getTime() < t0 + janela);
  }, [t0, janela, inicio]);

  const minuto = 60_000;

  return (
    <View style={styles.bloco}>
      <Text style={[styles.dica, previa !== null && styles.dicaAtiva]} accessibilityLiveRegion="polite">
        {previa !== null ? tr('Solte para ir às {0}', [hora(new Date(previa))]) : tr('Arraste ou toque na barra para escolher o horário')}
      </Text>

      <View
        ref={barra}
        style={[styles.barra, previa !== null && styles.barraAtiva, SO_NA_WEB]}
        onLayout={e => { setLargura(e.nativeEvent.layout.width); medir(); }}
        {...gestos}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={tr('Linha do tempo das {0} às {1}, com {2} {3} de movimento', [hora(inicio), hora(new Date(fim.getTime() - 1)), movimentos.length, movimentos.length === 1 ? tr('minuto') : tr('minutos')])}
        accessibilityValue={{ text: cursor ? tr('Vídeo em {0}', [hora(cursor)]) : tr('Nenhum vídeo aberto') }}
        accessibilityActions={[{ name: 'increment', label: tr('Avançar um minuto') }, { name: 'decrement', label: tr('Voltar um minuto') }]}
        onAccessibilityAction={e => {
          const base = cursor?.getTime() ?? t0;
          aoTocar(new Date(base + (e.nativeEvent.actionName === 'increment' ? minuto : -minuto)));
        }}
      >
        {faixas.map(f => (
          <View key={f.de} pointerEvents="none" style={[styles.faixa, { left: `${fracao(f.de) * 100}%`, width: `${Math.max((fracao(f.ate) - fracao(f.de)) * 100, 0.3)}%` }]} />
        ))}
        {movimentos.map(m => (
          <View
            key={m.id}
            pointerEvents="none"
            style={[styles.movimento, { left: `${fracao(m.de) * 100}%`, width: Math.max((fracao(m.ate) - fracao(m.de)) * largura, componentes.linhaDoTempo.marca) }]}
          />
        ))}
        {cursor && cursor.getTime() >= t0 && cursor.getTime() <= t0 + janela && (
          <View pointerEvents="none" style={[styles.cursor, { left: `${fracao(cursor.getTime()) * 100}%` }]} />
        )}
        {previa !== null && <View pointerEvents="none" style={[styles.cursor, styles.cursorDaPrevia, { left: `${fracao(previa) * 100}%` }]} />}
      </View>

      <View style={styles.rotulos} pointerEvents="none">
        {rotulos.map(d => (
          <Text key={d.getTime()} style={[styles.rotulo, { left: `${fracao(d.getTime()) * 100}%` }]}>{hora(d)}</Text>
        ))}
      </View>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  bloco: { gap: espaco[1.5] },
  dica: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, textAlign: 'center' },
  dicaAtiva: { fontFamily: fontes.textoForte, color: c.azul },
  barra: { height: componentes.linhaDoTempo.altura, borderRadius: raio.medio, backgroundColor: c.fundo, borderWidth: 1, borderColor: c.linha, overflow: 'hidden' },
  barraAtiva: { borderColor: c.luz, boxShadow: c.brilho },
  faixa: { position: 'absolute', top: 0, bottom: 0, backgroundColor: c.linha },
  movimento: { position: 'absolute', top: 0, bottom: 0, backgroundColor: c.luz },
  cursor: {
    position: 'absolute', top: 0, bottom: 0, width: componentes.linhaDoTempo.marca, marginLeft: -componentes.linhaDoTempo.marca / 2,
    backgroundColor: c.texto, boxShadow: c.brilho,
  },
  // o traço que segue o dedo: mais largo, pra não sumir embaixo dele
  cursorDaPrevia: { width: componentes.linhaDoTempo.marca * 2, marginLeft: -componentes.linhaDoTempo.marca, backgroundColor: c.azul },
  rotulos: { height: corpo.micro + espaco[1] },
  // cada rótulo é centrado no seu ponto (largura fixa, meia largura pra trás)
  rotulo: {
    position: 'absolute', width: componentes.linhaDoTempo.rotulo, marginLeft: -componentes.linhaDoTempo.rotulo / 2, textAlign: 'center',
    fontFamily: fontes.texto, fontSize: corpo.micro, color: c.textoSuave,
  },
});
