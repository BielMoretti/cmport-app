import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { NATIVO, useReduzirMovimento } from '@/components/efeitos';
import { useTema } from '@/contexts/TemaContext';
import { componentes } from '@/lib/tema';

/**
 * As "imagens" do app são desenhadas aqui, em vetor: brilhos, o horizonte de prédios
 * de cada condomínio, a varredura de câmera. Não há foto de banco de imagens — cada
 * condomínio ganha um desenho próprio, gerado a partir do id dele.
 */

/** Halo azul que some nas bordas. */
export function Brilho({ tamanho, forca = 0.6 }: { tamanho: number; forca?: number }) {
  const { cores } = useTema();
  const id = useId();
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={cores.luz} stopOpacity={forca} />
          <Stop offset="0.45" stopColor={cores.luz} stopOpacity={forca * 0.28} />
          <Stop offset="1" stopColor={cores.luz} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Vai e volta contínuo entre 0 e 1 — base dos movimentos lentos. */
function useVaivem(duracao: number, atraso = 0): Animated.Value {
  const reduzir = useReduzirMovimento();
  const valor = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduzir) return;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.timing(valor, { toValue: 1, duration: duracao, delay: atraso, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVO }),
        Animated.timing(valor, { toValue: 0, duration: duracao, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVO }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [reduzir, valor, duracao, atraso]);
  return valor;
}

/** Fundo da tela de entrada: malha fina e dois brilhos azuis que derivam devagar. */
export function FundoVivo() {
  const { cores } = useTema();
  const a = useVaivem(9000);
  const b = useVaivem(12000, 600);
  const linhas = Array.from({ length: 13 }, (_, i) => i * 8 + 2);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        {linhas.map(x => <Line key={`v${x}`} x1={x} y1="0" x2={x} y2="200" stroke={cores.luz} strokeOpacity={0.07} strokeWidth={0.15} />)}
        {Array.from({ length: 25 }, (_, i) => i * 8 + 4).map(y => (
          <Line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke={cores.luz} strokeOpacity={0.07} strokeWidth={0.15} />
        ))}
      </Svg>
      <Animated.View
        style={{
          position: 'absolute', top: '-12%', left: '-35%',
          transform: [
            { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) },
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }) },
          ],
        }}
      >
        <Brilho tamanho={460} forca={0.5} />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute', bottom: '-18%', right: '-45%',
          transform: [
            { translateX: b.interpolate({ inputRange: [0, 1], outputRange: [0, -80] }) },
            { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
          ],
        }}
      >
        <Brilho tamanho={520} forca={0.38} />
      </Animated.View>
    </View>
  );
}

/** Halo que respira atrás de um elemento (o leão, o topo do poste). */
export function Respiro({ tamanho, forca }: { tamanho: number; forca?: number }) {
  const v = useVaivem(2400);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }],
      }}
    >
      <Brilho tamanho={tamanho} forca={forca} />
    </Animated.View>
  );
}

// Gerador pseudoaleatório com semente — o mesmo condomínio sempre gera o mesmo desenho
function sorteador(semente: number) {
  let t = (semente * 2654435761) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Horizonte de prédios à noite, com janelas acesas em azul. `semente` é o id do
 * condomínio: cada um tem a sua silhueta. O desenho encosta na base e preenche a largura.
 */
export function Horizonte({ semente, style }: { semente: number; style?: StyleProp<ViewStyle> }) {
  const { cores } = useTema();
  const L = 400;
  const A = 140;

  const { predios, janelas } = useMemo(() => {
    const sorte = sorteador(semente);
    const predios: { x: number; y: number; w: number; h: number; antena: boolean }[] = [];
    const janelas: { x: number; y: number; o: number }[] = [];
    let x = -6;
    while (x < L) {
      const w = 26 + Math.floor(sorte() * 34);
      const h = 34 + Math.floor(sorte() * 92);
      const y = A - h;
      predios.push({ x, y, w, h, antena: sorte() > 0.72 });
      for (let jy = y + 8; jy < A - 8; jy += 9) {
        for (let jx = x + 6; jx < x + w - 6; jx += 8) {
          if (sorte() < 0.34) janelas.push({ x: jx, y: jy, o: 0.35 + sorte() * 0.65 });
        }
      }
      x += w + 3 + Math.floor(sorte() * 5);
    }
    return { predios, janelas };
  }, [semente]);

  return (
    <View style={style} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="xMidYMax slice">
        {predios.map((p, i) => (
          <Path
            key={`p${i}`}
            d={`M${p.x} ${A} V${p.y} H${p.x + p.w} V${A} Z${p.antena ? ` M${p.x + p.w / 2} ${p.y} V${p.y - 12}` : ''}`}
            fill={cores.predio}
            stroke={cores.luz}
            strokeOpacity={0.45}
            strokeWidth={0.8}
          />
        ))}
        {janelas.map((j, i) => (
          <Rect key={`j${i}`} x={j.x} y={j.y} width={4} height={5} fill={cores.luz} fillOpacity={j.o} />
        ))}
      </Svg>
    </View>
  );
}

/** Véu: degradê da cor de fundo, pra o texto por cima da ilustração continuar legível. */
export function Veu({
  cor, direcao = 'baixo', inicio = 0, style,
}: { cor: string; direcao?: 'baixo' | 'esquerda'; /** fração (0–1) da área que fica sem véu nenhum */ inicio?: number; style?: StyleProp<ViewStyle> }) {
  const id = useId();
  const pontas = direcao === 'baixo' ? { x1: '0', y1: '0', x2: '0', y2: '1' } : { x1: '1', y1: '0', x2: '0', y2: '0' };
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
        <Defs>
          <LinearGradient id={id} {...pontas}>
            <Stop offset={inicio} stopColor={cor} stopOpacity={0} />
            <Stop offset={inicio + (1 - inicio) * 0.7} stopColor={cor} stopOpacity={0.86} />
            <Stop offset="1" stopColor={cor} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="10" height="10" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Faixa de luz que desce pela área, como a varredura de uma câmera. */
export function Varredura({ altura }: { altura: number }) {
  const { cores } = useTema();
  const reduzir = useReduzirMovimento();
  const id = useId();
  const valor = useRef(new Animated.Value(0)).current;
  const FAIXA = 70;

  useEffect(() => {
    if (reduzir) return;
    const laco = Animated.loop(
      Animated.timing(valor, { toValue: 1, duration: 3800, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVO }),
    );
    laco.start();
    return () => laco.stop();
  }, [reduzir, valor]);

  if (reduzir) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: FAIXA,
        transform: [{ translateY: valor.interpolate({ inputRange: [0, 1], outputRange: [-FAIXA, altura] }) }],
      }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cores.luz} stopOpacity={0} />
            <Stop offset="0.92" stopColor={cores.luz} stopOpacity={0.22} />
            <Stop offset="1" stopColor={cores.luz} stopOpacity={0.85} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="10" height="10" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Reflexo que atravessa um botão de tempos em tempos. */
export function Reflexo({ largura }: { largura: number }) {
  const reduzir = useReduzirMovimento();
  const valor = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduzir || largura === 0) return;
    const laco = Animated.loop(
      Animated.sequence([
        Animated.delay(1600),
        Animated.timing(valor, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: NATIVO }),
        Animated.timing(valor, { toValue: 0, duration: 0, useNativeDriver: NATIVO }),
      ]),
    );
    laco.start();
    return () => laco.stop();
  }, [reduzir, largura, valor]);

  if (reduzir || largura === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: largura * 0.28, backgroundColor: 'rgba(255, 255, 255, 0.28)',
        transform: [
          { translateX: valor.interpolate({ inputRange: [0, 1], outputRange: [-largura * 0.4, largura * 1.2] }) },
          { skewX: '-20deg' },
        ],
      }}
    />
  );
}

/** Número que sobe contando até o valor. */
export function Contador({ valor, style }: { valor: number; style?: StyleProp<TextStyle> }) {
  const reduzir = useReduzirMovimento();
  const [mostrado, setMostrado] = useState(reduzir ? valor : 0);

  useEffect(() => {
    if (reduzir) { setMostrado(valor); return; }
    const anim = new Animated.Value(0);
    const ouvinte = anim.addListener(({ value }) => setMostrado(Math.round(value)));
    // sempre no JS: o valor precisa voltar pro React a cada quadro
    Animated.timing(anim, { toValue: valor, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(ouvinte);
  }, [valor, reduzir]);

  return <Text style={style} accessibilityLabel={String(valor)}>{mostrado}</Text>;
}

/** Quatro cantos de mira sobre o vídeo. */
export function Mira() {
  const { cores } = useTema();
  const { canto, traco, margem } = componentes.mira;
  const base: ViewStyle = { position: 'absolute', width: canto, height: canto, borderColor: cores.luz };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[base, { top: margem, left: margem, borderTopWidth: traco, borderLeftWidth: traco }]} />
      <View style={[base, { top: margem, right: margem, borderTopWidth: traco, borderRightWidth: traco }]} />
      <View style={[base, { bottom: margem, left: margem, borderBottomWidth: traco, borderLeftWidth: traco }]} />
      <View style={[base, { bottom: margem, right: margem, borderBottomWidth: traco, borderRightWidth: traco }]} />
    </View>
  );
}

/** Desenho pequeno de uma câmera de segurança, para as linhas da lista. */
export function GlifoCamera({ cor }: { cor: string }) {
  const t = componentes.glifo;
  return (
    <Svg width={t} height={t} viewBox="0 0 24 24" fill="none">
      <Path d="M3 8.5 15.5 5l2 6.5L5 15z" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M17 9.5l3.5-1 .9 3-3.4 1" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M8.5 14v4.5H4" stroke={cor} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Ícones das abas — traço simples, na cor que a barra de abas mandar

export function GlifoPainel({ cor, tamanho }: { cor: string; tamanho: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}

export function GlifoPoste({ cor, tamanho }: { cor: string; tamanho: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="M8 21V4M5 21h6M8 6h8M8 11h6" stroke={cor} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M16 4.5h3.5v3H16zM14 9.5h3.5v3H14z" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}

export function GlifoAdmin({ cor, tamanho }: { cor: string; tamanho: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3l7.5 3v5.5c0 4.5-3 8-7.5 9.5-4.5-1.5-7.5-5-7.5-9.5V6z" stroke={cor} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M8.8 12.2l2.3 2.3 4.2-4.6" stroke={cor} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const traco = { strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function GlifoVoltar({ cor, tamanho }: { cor: string; tamanho: number }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"><Path d="M14.5 5.5 8 12l6.5 6.5" stroke={cor} {...traco} /></Svg>;
}

export function GlifoInicio({ cor, tamanho }: { cor: string; tamanho: number }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"><Path d="M4 11 12 4l8 7v8.5H14.5V14h-5v5.5H4z" stroke={cor} {...traco} /></Svg>;
}

export function GlifoCameraAba({ cor, tamanho }: { cor: string; tamanho: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="M3 8.5 15.5 5l2 6.5L5 15z" stroke={cor} {...traco} />
      <Path d="M17 9.5l3.5-1 .9 3-3.4 1M8.5 14v4.5H4" stroke={cor} {...traco} />
    </Svg>
  );
}

export function GlifoAlerta({ cor, tamanho }: { cor: string; tamanho: number }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"><Path d="M12 4 21 19.5H3zM12 10v4.5M12 17v.4" stroke={cor} {...traco} /></Svg>;
}

export function GlifoPredio({ cor, tamanho }: { cor: string; tamanho: number }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"><Path d="M5 20V5h9v15M14 10h5v10M3 20h18M8 9h3M8 13h3M8 17h3" stroke={cor} {...traco} /></Svg>;
}

export function GlifoPessoas({ cor, tamanho }: { cor: string; tamanho: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="M9 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM3 19.5c0-3 2.7-5 6-5s6 2 6 5M16 11.2a2.7 2.7 0 0 0 0-5.3M17.5 14.7c2 .5 3.5 2.2 3.5 4.8" stroke={cor} {...traco} />
    </Svg>
  );
}

export function GlifoPulso({ cor, tamanho }: { cor: string; tamanho: number }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"><Path d="M3 12.5h4l2.5-6 4 11.5 2.5-5.500h5" stroke={cor} {...traco} /></Svg>;
}

export function GlifoSinal({ cor, tamanho }: { cor: string; tamanho: number }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"><Path d="M4.5 9.500a11 11 0 0 1 15 0M7.5 12.800a6.5 6.5 0 0 1 9 0M12 17v.4" stroke={cor} {...traco} /></Svg>;
}

export function GlifoSemSinal({ cor, tamanho }: { cor: string; tamanho: number }) {
  return <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none"><Path d="M4.5 9.500a11 11 0 0 1 15 0M7.5 12.800a6.5 6.5 0 0 1 9 0M12 17v.4M4 4l16 16" stroke={cor} {...traco} /></Svg>;
}
