import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useEstilos } from '@/contexts/TemaContext';
import type { Trecho } from '@/lib/gravacoes';
import { componentes, corpo, espaco, fontes, raio, type Paleta } from '@/lib/tema';

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

/**
 * A barra do tempo das gravações: a faixa clara é onde há gravação, os traços
 * azuis são os minutos com movimento e o traço branco é onde o vídeo está agora.
 * Tocar na barra leva o vídeo para aquele horário.
 */
export default function LinhaDoTempo({
  trechos, inicio, fim, cursor, aoTocar,
}: { trechos: Trecho[]; inicio: Date; fim: Date; cursor: Date | null; aoTocar: (momento: Date) => void }) {
  const styles = useEstilos(criarEstilos);
  const [largura, setLargura] = useState(0);
  const t0 = inicio.getTime();
  const janela = fim.getTime() - t0;
  const fracao = (ms: number) => Math.max(0, Math.min(1, (ms - t0) / janela));

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
    // alinhados à meia-noite local do dia (03:00, 06:00…), não ao começo da janela
    const meiaNoite = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime();
    const lista: Date[] = [];
    for (let t = meiaNoite + Math.ceil((t0 - meiaNoite) / passo) * passo; t <= t0 + janela; t += passo) lista.push(new Date(t));
    // os das pontas ficariam cortados pela borda; a janela já é dita por extenso acima da barra
    return lista.filter(d => d.getTime() > t0 && d.getTime() < t0 + janela);
  }, [t0, janela, inicio]);

  return (
    <View style={styles.bloco}>
      <Pressable
        onLayout={e => setLargura(e.nativeEvent.layout.width)}
        onPress={e => { if (largura > 0) aoTocar(new Date(t0 + (e.nativeEvent.locationX / largura) * janela)); }}
        accessibilityRole="adjustable"
        accessibilityLabel={`Linha do tempo das ${hora(inicio)} às ${hora(new Date(fim.getTime() - 1))}. ${movimentos.length} minutos com movimento. Toque num ponto para assistir.`}
        style={styles.barra}
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
      </Pressable>

      <View style={styles.rotulos}>
        {rotulos.map(d => (
          <Text key={d.getTime()} style={[styles.rotulo, { left: `${fracao(d.getTime()) * 100}%` }]}>{hora(d)}</Text>
        ))}
      </View>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  bloco: { gap: espaco[1] },
  barra: { height: componentes.linhaDoTempo.altura, borderRadius: raio.medio, backgroundColor: c.fundo, borderWidth: 1, borderColor: c.linha, overflow: 'hidden' },
  faixa: { position: 'absolute', top: 0, bottom: 0, backgroundColor: c.linha },
  movimento: { position: 'absolute', top: 0, bottom: 0, backgroundColor: c.luz },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: componentes.linhaDoTempo.marca, marginLeft: -componentes.linhaDoTempo.marca / 2, backgroundColor: c.texto, boxShadow: c.brilho },
  rotulos: { height: corpo.micro + espaco[1] },
  // cada rótulo é centrado no seu ponto (largura fixa, meia largura pra trás)
  rotulo: {
    position: 'absolute', width: componentes.linhaDoTempo.rotulo, marginLeft: -componentes.linhaDoTempo.rotulo / 2, textAlign: 'center',
    fontFamily: fontes.texto, fontSize: corpo.micro, color: c.textoSuave,
  },
});
