import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ehSindico } from '@/lib/acesso';
import { TemaProvider, useTema } from '@/contexts/TemaContext';
import { Tela } from '@/components/ui';
import { corpo, fontes, temaEscuro } from '@/lib/tema';
import { aoMudarIdioma, carregarIdioma, idiomaAtual, tr, type Idioma } from '@/lib/idioma';

function Rotas() {
  const { usuario, carregando } = useAuth();
  const { cores, modo } = useTema();
  // Se a fonte falhar, segue com a do sistema em vez de travar na tela de espera
  const [fontesProntas, erroFontes] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  if (carregando || (!fontesProntas && !erroFontes)) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.fundo, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={cores.azul} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={temaEscuro(modo) ? 'light' : 'dark'} />
      <Stack
        // o fundo com as luzes é desenhado aqui, uma vez, atrás de cada tela
        screenLayout={({ children }) => <Tela>{children}</Tela>}
        screenOptions={{
          headerStyle: { backgroundColor: cores.fundo },
          headerTintColor: cores.texto,
          headerTitleStyle: { fontFamily: fontes.nome, fontSize: corpo.cabecalho },
          headerShadowVisible: false,
          headerShown: false,   // cada tela desenha o próprio topo (components/ui.tsx)
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: cores.fundo },
        }}
      >
        {/* Primeiro acesso: até criar a própria senha, esta é a única tela */}
        <Stack.Protected guard={!!usuario && !!usuario.trocarSenha}>
          <Stack.Screen name="primeira-senha" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={!!usuario && !usuario.trocarSenha}>
          <Stack.Screen name="(abas)" options={{ headerShown: false, title: tr('Início') }} />
          <Stack.Screen name="condominio/[id]" options={{ title: tr('Condomínio') }} />
          <Stack.Screen name="poste/[id]" options={{ title: tr('Poste') }} />
          <Stack.Screen name="camera/[id]" options={{ title: tr('Câmera') }} />
          <Stack.Screen name="conta" options={{ title: tr('Minha conta') }} />
        </Stack.Protected>


        {/* Tela do síndico: a ficha de um morador (a lista fica na aba Gestão) */}
        <Stack.Protected guard={ehSindico(usuario?.role) && !usuario?.trocarSenha}>
          <Stack.Screen name="sindico/morador" options={{ title: tr('Morador') }} />
        </Stack.Protected>

        <Stack.Protected guard={!usuario}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="recuperar-senha" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [idioma, setIdioma] = useState<Idioma | null>(null);
  useEffect(() => {
    void carregarIdioma().then(setIdioma);
    return aoMudarIdioma(() => setIdioma(idiomaAtual()));
  }, []);
  // um instante, só na abertura: sem isso a primeira tela piscaria no idioma errado
  if (!idioma) return null;

  return (
    <TemaProvider>
      <AuthProvider>
        {/* a chave refaz as telas quando o idioma muda, para nenhum texto ficar no antigo */}
        <Rotas key={idioma} />
      </AuthProvider>
    </TemaProvider>
  );
}
