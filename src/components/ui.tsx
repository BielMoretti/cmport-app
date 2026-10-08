import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Contador, Fundo, GlifoVoltar } from '@/components/arte';
import BotaoTema from '@/components/BotaoTema';
import { NATIVO, Toque, useReduzirMovimento } from '@/components/efeitos';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { aceso, componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';

/**
 * Kit visual do app: painéis de vidro sobre um fundo azul-marinho com luz, tudo
 * arredondado, um assunto por cartão. Toda tela é montada com estas peças — é o que
 * mantém o app com cara de uma coisa só.
 */

/** Moldura de toda tela: o fundo com as luzes, e a tela por cima. */
export function Tela({ children }: { children: ReactNode }) {
  return (
    <View style={estilosFixos.tela}>
      <Fundo />
      {children}
    </View>
  );
}

/** O logo sobre uma placa clara de vidro — o leão é grafite e some direto no fundo escuro. */
export function LogoPlaca({ tamanho, completo = false }: { tamanho: number; completo?: boolean }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={[styles.logoPlaca, { width: tamanho, height: tamanho, borderRadius: tamanho * 0.3, padding: tamanho * 0.12 }]}>
      <Image
        source={completo ? require('../../assets/logo.png') : require('../../assets/leao.png')}
        style={estilosFixos.logo}
        resizeMode="contain"
        accessibilityLabel="CM Port"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

/** Cartão arredondado. Com `onPress`, afunda de leve e acende o brilho azul. */
export function Cartao({
  children, onPress, destaque = false, rotulo, style,
}: { children: ReactNode; onPress?: () => void; destaque?: boolean; rotulo?: string; style?: StyleProp<ViewStyle> }) {
  const styles = useEstilos(criarEstilos);
  const estilo = [styles.cartao, destaque && styles.cartaoDestaque, style];
  // o fio de luz no topo é o que faz o painel ler como vidro
  const fio = <View style={styles.fio} pointerEvents="none" />;
  if (!onPress) return <View style={estilo}>{fio}{children}</View>;
  return (
    <Toque onPress={onPress} brilho accessibilityRole="button" accessibilityLabel={rotulo} style={estilo}>
      {fio}
      {children}
    </Toque>
  );
}

/** Caixinha arredondada com um ícone dentro, tingida de azul. */
export function IconeCaixa({ children, tom = 'azul' }: { children: ReactNode; tom?: 'azul' | 'erro' | 'suave' }) {
  const styles = useEstilos(criarEstilos);
  return <View style={[styles.iconeCaixa, tom === 'erro' && styles.iconeCaixaErro, tom === 'suave' && styles.iconeCaixaSuave]}>{children}</View>;
}

/** Título de bloco, com uma ação opcional à direita ("Ver todas"). */
export function Bloco({ titulo, acao, aoTocar, children }: { titulo: string; acao?: string; aoTocar?: () => void; children: ReactNode }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={styles.bloco}>
      <View style={styles.blocoCabeca}>
        <Text style={styles.blocoTitulo} accessibilityRole="header">{titulo}</Text>
        {acao && aoTocar && (
          <Pressable onPress={aoTocar} hitSlop={espaco[3]} accessibilityRole="button">
            <Text style={styles.blocoAcao}>{acao}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

/** Quadradinho de número: ícone em cima, o número que sobe contando, a legenda embaixo. */
export function Numero({ icone, valor, legenda, tom = 'azul' }: { icone: ReactNode; valor: number; legenda: string; tom?: 'azul' | 'erro' }) {
  const styles = useEstilos(criarEstilos);
  return (
    <View style={[styles.numero, tom === 'erro' && valor > 0 && styles.numeroErro]} accessibilityLabel={`${valor} ${legenda}`}>
      {icone}
      <Contador valor={valor} style={styles.numeroValor} />
      <Text style={styles.numeroLegenda} numberOfLines={1}>{legenda}</Text>
    </View>
  );
}

/** Pílula de estado: ponto colorido + texto (a cor nunca vai sozinha). */
export function Pilula({ texto, tom = 'suave' }: { texto: string; tom?: 'azul' | 'erro' | 'suave' }) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const cor = tom === 'azul' ? cores.estadoOnline : tom === 'erro' ? cores.estadoOffline : cores.estadoNeutro;
  return (
    <View style={[styles.pilula, tom === 'azul' && styles.pilulaAzul, tom === 'erro' && styles.pilulaErro]}>
      <View style={[styles.pilulaPonto, { backgroundColor: cor }]} />
      <Text style={styles.pilulaTexto}>{texto}</Text>
    </View>
  );
}

/** Barra de progresso que cresce do zero até o valor quando aparece. */
export function Progresso({ fracao, rotulo }: { fracao: number; rotulo: string }) {
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const f = Math.max(0, Math.min(1, fracao));
  const valor = useRef(new Animated.Value(reduzir ? f : 0)).current;
  useEffect(() => {
    // a largura não anima no driver nativo
    Animated.timing(valor, { toValue: f, duration: reduzir ? 0 : 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [f, reduzir, valor]);
  return (
    <View style={styles.progresso} accessibilityRole="progressbar" accessibilityLabel={rotulo} accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}>
      <Animated.View style={[styles.progressoCheio, { width: valor.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

/** Bloco que pulsa de leve enquanto os dados não chegam (no lugar de um spinner). */
export function Esqueleto({ altura, largura = '100%' }: { altura: number; largura?: number | `${number}%` }) {
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const valor = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduzir) return;
    const laco = Animated.loop(Animated.sequence([
      Animated.timing(valor, { toValue: 1, duration: 700, useNativeDriver: NATIVO }),
      Animated.timing(valor, { toValue: 0.5, duration: 700, useNativeDriver: NATIVO }),
    ]));
    laco.start();
    return () => laco.stop();
  }, [reduzir, valor]);
  return <Animated.View style={[styles.esqueleto, { height: altura, width: largura, opacity: valor }]} accessibilityLabel="Carregando" />;
}

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

function saudacaoDaHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia,';
  if (h < 18) return 'Boa tarde,';
  return 'Boa noite,';   // o nome vem logo depois, na mesma linha
}

/**
 * Topo das abas. Em cima, a marca (o leão e o nome) e os botões de tema e de conta;
 * embaixo, a saudação com a data — ou o título da aba, nas outras telas.
 */
export function Saudacao({ titulo }: { titulo?: string }) {
  const styles = useEstilos(criarEstilos);
  const router = useRouter();
  const { usuario } = useAuth();
  const topo = useSafeAreaInsets().top;
  // como a pessoa pediu para ser chamada (Minha conta) ou, sem isso, o primeiro nome
  const primeiroNome = usuario?.apelido?.trim() || usuario?.nome.split(' ')[0];
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={[styles.saudacao, { paddingTop: topo + espaco[3] }]}>
      <View style={styles.marcaLinha}>
        <View style={styles.marca}>
          <LogoPlaca tamanho={componentes.logoPlaca.topo} />
          <Text style={styles.marcaNome} accessibilityRole="header">CM PORT</Text>
        </View>
        <BotaoTema />
        <Toque onPress={() => router.push('/conta')} accessibilityRole="button" accessibilityLabel="Abrir minha conta" style={styles.avatar}>
          <Text style={styles.avatarTexto}>{usuario ? iniciais(usuario.nome) : ''}</Text>
        </Toque>
      </View>

      {titulo ? (
        <Text style={styles.saudacaoNome} numberOfLines={1}>{titulo}</Text>
      ) : (
        <View>
          <Text style={styles.saudacaoNome} numberOfLines={1}>{saudacaoDaHora()}{primeiroNome ? ` ${primeiroNome}` : ''}</Text>
          <Text style={styles.saudacaoOla}>{hoje.charAt(0).toUpperCase() + hoje.slice(1)}</Text>
        </View>
      )}
    </View>
  );
}

/** Topo das telas internas: botão redondo de voltar, título e um espaço para ação à direita. */
export function Cabecalho({ titulo, direita }: { titulo: string; direita?: ReactNode }) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const router = useRouter();
  const topo = useSafeAreaInsets().top;
  return (
    <View style={[styles.cabecalho, { paddingTop: topo + espaco[3] }]}>
      <Toque
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        style={styles.redondo}
      >
        <GlifoVoltar cor={cores.texto} tamanho={componentes.iconeCaixa.glifo} />
      </Toque>
      <Text style={styles.cabecalhoTitulo} numberOfLines={1} accessibilityRole="header">{titulo}</Text>
      <View style={styles.cabecalhoDireita}>{direita}</View>
    </View>
  );
}

const estilosFixos = StyleSheet.create({
  tela: { flex: 1 },
  logo: { width: '100%', height: '100%' },
});

const criarEstilos = (c: Paleta) => StyleSheet.create({
  cartao: {
    ...vidro(c), borderRadius: raio.grande, boxShadow: c.vidroSombra,
    padding: componentes.cartao.respiro, overflow: 'hidden',
  },
  cartaoDestaque: { ...vidro(c, 'forte'), borderColor: c.azul, boxShadow: c.brilho },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  logoPlaca: { backgroundColor: c.placa, borderWidth: 1, borderColor: c.vidroFio, boxShadow: c.brilho },

  iconeCaixa: {
    width: componentes.iconeCaixa.tamanho, height: componentes.iconeCaixa.tamanho, borderRadius: componentes.iconeCaixa.raio,
    backgroundColor: c.azulSuave, alignItems: 'center', justifyContent: 'center',
  },
  iconeCaixaErro: { backgroundColor: c.erroSuave },
  iconeCaixaSuave: { backgroundColor: c.linha },

  bloco: { gap: espaco[3] },
  blocoCabeca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blocoTitulo: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, color: c.texto },
  blocoAcao: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.azul },

  numero: {
    flex: 1, alignItems: 'center', gap: espaco[1], paddingVertical: espaco[3.5], paddingHorizontal: espaco[1],
    ...vidro(c), borderRadius: raio.grande,
  },
  numeroErro: { borderColor: c.estadoOffline },
  numeroValor: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  numeroLegenda: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },

  pilula: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[1.5], borderRadius: raio.pilula, borderWidth: 1, borderColor: c.linha,
    paddingHorizontal: espaco[2.5], paddingVertical: espaco[1],
  },
  pilulaAzul: { borderColor: c.azul, backgroundColor: c.azulSuave },
  pilulaErro: { borderColor: c.estadoOffline, backgroundColor: c.erroSuave },
  pilulaPonto: { width: componentes.selo.ponto, height: componentes.selo.ponto, borderRadius: componentes.selo.ponto / 2 },
  pilulaTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.texto },

  progresso: { height: componentes.medidor.altura, borderRadius: raio.pilula, backgroundColor: c.linha, overflow: 'hidden' },
  progressoCheio: { height: '100%', borderRadius: raio.pilula, ...aceso(c) },

  esqueleto: { borderRadius: raio.grande, ...vidro(c) },

  saudacao: { paddingHorizontal: espaco[5], paddingBottom: espaco[4], gap: espaco[4] },
  marcaLinha: { flexDirection: 'row', alignItems: 'center', gap: espaco[2] },
  marca: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaco[2.5] },
  marcaNome: { fontFamily: fontes.nome, fontSize: corpo.nome, color: c.texto, letterSpacing: espaco[1] },
  saudacaoOla: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave, marginTop: espaco[0.5] },
  saudacaoNome: { fontFamily: fontes.nome, fontSize: corpo.titulo + espaco[1], lineHeight: entrelinha.destaque, color: c.texto },
  avatar: {
    width: componentes.avatar, height: componentes.avatar, borderRadius: componentes.avatar / 2, ...aceso(c),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTexto: { fontFamily: fontes.nome, fontSize: corpo.base, color: c.sobreLuz },

  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], paddingHorizontal: espaco[4], paddingBottom: espaco[3] },
  redondo: {
    width: componentes.avatar, height: componentes.avatar, borderRadius: componentes.avatar / 2, ...vidro(c, 'forte'),
    alignItems: 'center', justifyContent: 'center',
  },
  cabecalhoTitulo: { flex: 1, fontFamily: fontes.nome, fontSize: corpo.cabecalho, color: c.texto },
  cabecalhoDireita: { minWidth: componentes.avatar, alignItems: 'flex-end' },
});
