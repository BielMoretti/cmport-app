import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';

import { GlifoAdmin, GlifoPainel, GlifoPoste } from '@/components/arte';
import BotaoTema from '@/components/BotaoTema';
import { useAuth } from '@/contexts/AuthContext';
import { useTema } from '@/contexts/TemaContext';
import { ehAdministrador } from '@/lib/acesso';
import { componentes, corpo, espaco, fontes } from '@/lib/tema';

export default function AbasLayout() {
  const { usuario, logout } = useAuth();
  const { cores } = useTema();
  const admin = ehAdministrador(usuario?.role);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: cores.fundo },
        headerTintColor: cores.texto,
        headerTitleStyle: { fontFamily: fontes.nome, fontSize: corpo.cabecalho },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: cores.fundo },
        tabBarStyle: { backgroundColor: cores.fundo, borderTopColor: cores.linha, height: componentes.abas.altura },
        tabBarActiveTintColor: cores.azul,
        tabBarInactiveTintColor: cores.textoSuave,
        tabBarLabelStyle: { fontFamily: fontes.textoForte, fontSize: corpo.micro },
        headerRight: () => (
          <View style={styles.acoes}>
            <BotaoTema />
            <Pressable onPress={logout} hitSlop={espaco[3]} accessibilityRole="button">
              <Text style={{ fontFamily: fontes.textoForte, fontSize: corpo.base, color: cores.azul }}>Sair</Text>
            </Pressable>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Painel', tabBarIcon: ({ focused }) => <GlifoPainel cor={focused ? cores.azul : cores.textoSuave} tamanho={componentes.abas.icone} /> }}
      />
      <Tabs.Screen
        name="postes"
        options={{ title: 'Postes', tabBarIcon: ({ focused }) => <GlifoPoste cor={focused ? cores.azul : cores.textoSuave} tamanho={componentes.abas.icone} /> }}
      />
      {/* A aba de administração só existe para ADMIN e DEV (ver lib/acesso.ts) */}
      <Tabs.Protected guard={admin}>
        <Tabs.Screen
          name="admin"
          options={{ title: 'Administração', tabBarIcon: ({ focused }) => <GlifoAdmin cor={focused ? cores.azul : cores.textoSuave} tamanho={componentes.abas.icone} /> }}
        />
      </Tabs.Protected>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // no navegador o cabeçalho não reserva margem à direita
  acoes: { flexDirection: 'row', alignItems: 'center', gap: espaco[2], marginRight: Platform.OS === 'web' ? espaco[4] : espaco[3] },
});
