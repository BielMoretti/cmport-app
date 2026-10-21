import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { NATIVO, useReduzirMovimento } from '@/components/efeitos';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { corpo, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import { tr } from '@/lib/idioma';

/**
 * Campo do código de 6 números da recuperação de senha, uma caixinha por número.
 *
 * Ao digitar o último número, as caixinhas se curvam num anel, giram uma volta e um quarto em
 * torno do centro e se juntam numa peça só com o código. A peça fica neutra até o servidor aceitar:
 * o verde com ✓ só aparece com `aceito` (a cor é reservada para o resultado, não para o esforço).
 * Tocar na peça volta às caixinhas para corrigir.
 *
 * Por que assim: é uma tela rara (esqueci a senha), então cabe um momento de capricho; o giro é
 * feito girando o "eixo" (um ponto no centro) com as caixinhas penduradas nele, só com transform e
 * opacidade, no driver nativo. Com "reduzir movimento" ligado, as caixinhas só dão lugar à peça.
 */

const QUANTOS = 6;
const CAIXA = 44;
const VAO = espaco[2];
const RAIO_DO_ANEL = 34;
// altura do palco: o anel inteiro (raio + meia caixinha, que ainda não encolheu no meio da curva) cabe sem passar por cima do rótulo
const ALTURA = 2 * (RAIO_DO_ANEL + 24);
const VERDE = '#16A34A';
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// marcos da animação (0 → 1): curvar no anel, girar fechando, a peça aparece
const CURVA = 0.32;
const FECHA = 0.82;

type Props = {
  value: string;
  onChange: (codigo: string) => void;
  aceito?: boolean;
  autoFocus?: boolean;
};

export default function CampoDeCodigo({ value, onChange, aceito = false, autoFocus }: Props) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const reduzir = useReduzirMovimento();
  const entrada = useRef<TextInput>(null);
  const [t] = useState(() => new Animated.Value(0));           // 0 = caixinhas, 1 = peça
  const [verde] = useState(() => new Animated.Value(aceito ? 1 : 0));
  const [junto, setJunto] = useState(false);                 // a peça já está na frente (para toque e leitor de tela)
  const completo = value.length === QUANTOS;

  // completou: curva, gira e junta; apagou um número: volta às caixinhas na hora
  useEffect(() => {
    if (completo) {
      entrada.current?.blur();
      const anima = Animated.timing(t, {
        toValue: 1, duration: reduzir ? 200 : 1100, easing: reduzir ? EASE_OUT : Easing.linear, useNativeDriver: NATIVO,
      });
      anima.start(({ finished }) => { if (finished) setJunto(true); });
      return () => anima.stop();
    }
    t.stopAnimation();
    t.setValue(0);
  }, [completo, reduzir, t]);
  const pecaNaFrente = completo && junto;

  useEffect(() => {
    Animated.timing(verde, { toValue: aceito ? 1 : 0, duration: 200, easing: EASE_OUT, useNativeDriver: NATIVO }).start();
  }, [aceito, verde]);

  function corrigir() {
    if (aceito) return;
    setJunto(false);
    onChange(value.slice(0, QUANTOS - 1));
    setTimeout(() => entrada.current?.focus(), 0);
  }

  const larguraDaFila = QUANTOS * CAIXA + (QUANTOS - 1) * VAO;
  // o "eixo" gira uma volta e um quarto enquanto o anel fecha
  const giro = t.interpolate({ inputRange: [0, CURVA, FECHA, 1], outputRange: ['0deg', '0deg', '450deg', '450deg'] });
  const caixasVisiveis = reduzir
    ? t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
    : t.interpolate({ inputRange: [0, FECHA - 0.08, FECHA], outputRange: [1, 1, 0] });
  const pecaVisivel = reduzir
    ? t.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
    : t.interpolate({ inputRange: [0, FECHA - 0.06, 1], outputRange: [0, 0, 1] });
  const pecaEscala = reduzir ? 1 : t.interpolate({ inputRange: [0, FECHA - 0.06, 1], outputRange: [0.9, 0.9, 1] });

  const digitos = value.split('');

  return (
    <View style={styles.area}>
      {/* o teclado vai para um campo invisível por cima: o celular oferece o código do e-mail ou SMS */}
      <TextInput
        ref={entrada}
        value={value}
        onChangeText={texto => { const so = texto.replace(/\D/g, '').slice(0, QUANTOS); if (so.length < QUANTOS) setJunto(false); onChange(so); }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={QUANTOS}
        autoFocus={autoFocus}
        caretHidden
        accessibilityLabel={tr('Código de 6 números')}
        style={[styles.entrada, pecaNaFrente && styles.escondida]}
        editable={!pecaNaFrente}
      />

      <View style={[styles.palco, { width: larguraDaFila }]} pointerEvents="none">
        {/* o eixo: um ponto no centro; as caixinhas ficam penduradas nele */}
        <Animated.View style={[styles.eixo, { transform: [{ rotate: reduzir ? '0deg' : giro }] }]}>
          {Array.from({ length: QUANTOS }, (_, i) => {
            const naFila = (i - (QUANTOS - 1) / 2) * (CAIXA + VAO);
            const angulo = (i / QUANTOS) * Math.PI * 2 - Math.PI / 2;
            const x = t.interpolate({
              inputRange: [0, CURVA, FECHA, 1],
              outputRange: [naFila, Math.cos(angulo) * RAIO_DO_ANEL, 0, 0],
              easing: EASE_IN_OUT,
            });
            const y = t.interpolate({
              inputRange: [0, CURVA, FECHA, 1],
              outputRange: [0, Math.sin(angulo) * RAIO_DO_ANEL, 0, 0],
              easing: EASE_IN_OUT,
            });
            const escala = t.interpolate({ inputRange: [0, CURVA, FECHA], outputRange: [1, 0.78, 0.62], extrapolate: 'clamp' });
            const ativa = !completo && i === Math.min(value.length, QUANTOS - 1);
            return (
              <Animated.View
                key={i}
                style={[
                  styles.caixa, ativa && styles.caixaAtiva,
                  { opacity: caixasVisiveis, transform: reduzir ? [{ translateX: naFila }] : [{ translateX: x }, { translateY: y }, { scale: escala }] },
                ]}
              >
                <Text style={styles.digito}>{digitos[i] ?? ''}</Text>
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>

      {/* a peça única com o código; neutra até o servidor aceitar */}
      <Animated.View style={[styles.pecaArea, { opacity: pecaVisivel, transform: [{ scale: pecaEscala }] }]} pointerEvents={pecaNaFrente ? 'auto' : 'none'}>
        <Pressable
          onPress={corrigir}
          disabled={!pecaNaFrente || aceito}
          accessibilityRole="button"
          accessibilityLabel={aceito ? tr('Código aceito') : tr('Código {0}. Toque para corrigir', [value.split('').join(' ')])}
          style={styles.peca}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.pecaVerde, { opacity: verde }]} />
          <Text style={[styles.pecaTexto, aceito && styles.pecaTextoAceito]}>
            {aceito ? '✓  ' : ''}{value.slice(0, 3)} {value.slice(3)}
          </Text>
          {!aceito && <Text style={styles.pecaDica}>{tr('Toque para corrigir')}</Text>}
        </Pressable>
      </Animated.View>
      {/* espaço reservado para as caixinhas (a peça e o anel ficam por cima) */}
      <View style={{ height: ALTURA }} />
      <Text style={[styles.oculto, { color: cores.textoSuave }]} accessibilityLiveRegion="polite">
        {aceito ? tr('Código aceito') : ''}
      </Text>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  area: { alignItems: 'center', justifyContent: 'center' },
  entrada: { position: 'absolute', top: 0, left: 0, right: 0, height: ALTURA, opacity: 0.011, color: 'transparent', zIndex: 2 },
  escondida: { height: 0 },
  palco: { position: 'absolute', top: 0, height: ALTURA, alignItems: 'center', justifyContent: 'center' },
  eixo: { width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  caixa: {
    position: 'absolute', width: CAIXA, height: CAIXA + 8, borderRadius: raio.medio,
    backgroundColor: c.superficieForte, borderWidth: 1, borderColor: c.vidroBorda,
    alignItems: 'center', justifyContent: 'center',
  },
  caixaAtiva: { borderColor: c.azul, borderWidth: 2 },
  digito: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, color: c.texto, fontVariant: ['tabular-nums'] },
  pecaArea: { position: 'absolute', top: 0, height: ALTURA, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  peca: {
    minWidth: 200, paddingHorizontal: espaco[5], paddingVertical: espaco[3], borderRadius: raio.grande, overflow: 'hidden',
    backgroundColor: c.azulSuave, borderWidth: 1, borderColor: c.vidroBorda, alignItems: 'center',
  },
  pecaVerde: { backgroundColor: VERDE },
  pecaTexto: { fontFamily: fontes.nome, fontSize: corpo.titulo, letterSpacing: espaco[1], color: c.texto, fontVariant: ['tabular-nums'] },
  pecaTextoAceito: { color: '#FFFFFF' },
  pecaDica: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, marginTop: 2 },
  oculto: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
