import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlifoCameraAba, GlifoInicio, GlifoPoste } from '@/components/arte';
import { NATIVO, useReduzirMovimento } from '@/components/efeitos';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { componentes, corpo, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';

const ABAS: Record<string, { titulo: string; icone: (cor: string) => ReactNode }> = {
  index: { titulo: 'Início', icone: cor => <GlifoInicio cor={cor} tamanho={componentes.abas.icone} /> },
  cameras: { titulo: 'Câmeras', icone: cor => <GlifoCameraAba cor={cor} tamanho={componentes.abas.icone} /> },
  postes: { titulo: 'Postes', icone: cor => <GlifoPoste cor={cor} tamanho={componentes.abas.icone} /> },
};

/** Uma aba: a ativa ganha um fundo azul que cresce por trás. */
function Aba({ nome, ativa, onPress }: { nome: string; ativa: boolean; onPress: () => void }) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const reduzir = useReduzirMovimento();
  const valor = useRef(new Animated.Value(ativa ? 1 : 0)).current;
  useEffect(() => {
    if (reduzir) { valor.setValue(ativa ? 1 : 0); return; }
    Animated.spring(valor, { toValue: ativa ? 1 : 0, speed: 18, bounciness: 8, useNativeDriver: NATIVO }).start();
  }, [ativa, reduzir, valor]);
  const aba = ABAS[nome];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativa }}
      accessibilityLabel={aba.titulo}
      style={styles.aba}
    >
      <Animated.View style={[styles.abaFundo, { opacity: valor, transform: [{ scale: valor.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} />
      {aba.icone(ativa ? cores.azul : cores.textoSuave)}
      <Text style={[styles.abaTexto, ativa && styles.abaTextoAtiva]}>{aba.titulo}</Text>
    </Pressable>
  );
}

export default function AbasLayout() {
  const styles = useEstilos(criarEstilos);
  const base = useSafeAreaInsets().bottom;

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: styles.cena }}
      // barra flutuante em pílula, no lugar da barra padrão
      tabBar={({ state, navigation }) => (
        <View style={[styles.barraArea, { paddingBottom: base + componentes.abas.margem }]} pointerEvents="box-none">
          <View style={styles.barra} accessibilityRole="tablist">
            {state.routes.filter(r => ABAS[r.name]).map(rota => {
              const ativa = state.routes[state.index]?.key === rota.key;
              return (
                <Aba
                  key={rota.key}
                  nome={rota.name}
                  ativa={ativa}
                  onPress={() => {
                    const evento = navigation.emit({ type: 'tabPress', target: rota.key, canPreventDefault: true });
                    if (!ativa && !evento.defaultPrevented) navigation.navigate(rota.name, rota.params);
                  }}
                />
              );
            })}
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="cameras" />
      <Tabs.Screen name="postes" />
    </Tabs>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  barraArea: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: componentes.abas.margem },
  barra: {
    flexDirection: 'row', width: '100%', maxWidth: componentes.abas.larguraMaxima, height: componentes.abas.altura,
    ...vidro(c, 'flutuante'), borderRadius: raio.pilula,
    padding: espaco[1.5], boxShadow: c.vidroSombra,
  },
  // o fundo é o da moldura da navegação (ver app/_layout.tsx)
  cena: { backgroundColor: 'transparent' },
  aba: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaco[0.5], borderRadius: raio.pilula },
  abaFundo: { ...StyleSheet.absoluteFill, borderRadius: raio.pilula, backgroundColor: c.azulSuave, borderWidth: 1, borderColor: c.vidroBorda },
  abaTexto: { fontFamily: fontes.textoForte, fontSize: corpo.micro, color: c.textoSuave },
  abaTextoAtiva: { color: c.azul },
});
