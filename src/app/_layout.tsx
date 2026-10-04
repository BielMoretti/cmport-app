import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Barlow_400Regular } from '@expo-google-fonts/barlow/400Regular';
import { Barlow_500Medium } from '@expo-google-fonts/barlow/500Medium';
import { BarlowSemiCondensed_600SemiBold } from '@expo-google-fonts/barlow-semi-condensed/600SemiBold';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TemaProvider, useTema } from '@/contexts/TemaContext';
import { corpo, fontes } from '@/lib/tema';

function Rotas() {
  const { usuario, carregando } = useAuth();
  const { cores, modo } = useTema();
  // Se a fonte falhar, segue com a do sistema em vez de travar na tela de espera
  const [fontesProntas, erroFontes] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    BarlowSemiCondensed_600SemiBold,
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
      <StatusBar style={modo === 'escuro' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: cores.fundo },
          headerTintColor: cores.texto,
          headerTitleStyle: { fontFamily: fontes.nome, fontSize: corpo.cabecalho },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: cores.fundo },
        }}
      >
        <Stack.Protected guard={!!usuario}>
          <Stack.Screen name="index" options={{ title: 'Painel' }} />
          <Stack.Screen name="condominio/[id]" options={{ title: 'Condomínio' }} />
          <Stack.Screen name="camera/[id]" options={{ title: 'Câmera' }} />
        </Stack.Protected>

        <Stack.Protected guard={!usuario}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <TemaProvider>
      <AuthProvider>
        <Rotas />
      </AuthProvider>
    </TemaProvider>
  );
}
