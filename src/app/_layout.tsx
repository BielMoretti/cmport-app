import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ehSindico } from '@/lib/acesso';
import { TemaProvider, useTema } from '@/contexts/TemaContext';
import { Tela } from '@/components/ui';
import Trancado from '@/components/Trancado';
import AceiteTermos from '@/components/AceiteTermos';
import AtivarProtecoes from '@/components/AtivarProtecoes';
import EscolherIdioma, { useIdiomaPendente } from '@/components/EscolherIdioma';
import { biometriaDisponivel, biometriaLigada } from '@/lib/biometria';
import { confirmarAvisos, prepararNotificacoes, useCameraDoAviso } from '@/lib/notificacoes';
import { voltandoDoPip } from '@/lib/pip';
import { atualizarWidget } from '@/widget/registrar';
import { corpo, fontes, temaEscuro } from '@/lib/tema';
import { aoMudarIdioma, carregarIdioma, idiomaAtual, tr, type Idioma } from '@/lib/idioma';

// com o app aberto, o aviso de câmera fora do ar também aparece e toca
prepararNotificacoes();

// fora da tela por mais que isto, o app tranca de novo (para quem ligou a trava em Minha conta)
const TRANCAR_DEPOIS_DE_MS = 2 * 60 * 1000;

/**
 * A trava do aplicativo (digital, rosto ou bloqueio de tela). `null` = ainda conferindo se a
 * pessoa ligou a trava; enquanto isso nenhuma tela aparece.
 */
function useTrava(logado: boolean, sessaoConferida: boolean): [boolean | null, () => void] {
  const [trancado, setTrancado] = useState<boolean | null>(null);
  const saiuEm = useRef<number | null>(null);
  const decidido = useRef(false);

  // Uma vez, quando o app termina de conferir a sessão guardada. Abriu já logado: tranca se a
  // trava está ligada e o aparelho ainda tem digital ou rosto (quem apagou a digital do aparelho
  // não fica preso do lado de fora). Abriu deslogado: quem entrar agora digita a senha, não tranca.
  useEffect(() => {
    if (!sessaoConferida || decidido.current) return;
    decidido.current = true;
    if (!logado) { setTrancado(false); return; }
    void (async () => {
      const tranca = (await biometriaLigada()) && (await biometriaDisponivel());
      setTrancado(atual => atual ?? tranca);
    })();
  }, [sessaoConferida, logado]);

  // voltou depois de um tempo em segundo plano: tranca de novo
  useEffect(() => {
    if (!logado) return;
    const ouvinte = AppState.addEventListener('change', estado => {
      if (estado !== 'active') { saiuEm.current ??= Date.now(); return; }
      const fora = saiuEm.current === null ? 0 : Date.now() - saiuEm.current;
      saiuEm.current = null;
      // quem estava vendo a câmera na janelinha flutuante não saiu do app: não tranca
      if (fora < TRANCAR_DEPOIS_DE_MS || voltandoDoPip()) return;
      void (async () => {
        if ((await biometriaLigada()) && (await biometriaDisponivel())) setTrancado(true);
      })();
    });
    return () => ouvinte.remove();
  }, [logado]);

  // sem ninguém logado não há o que trancar (a tela é a do login)
  return [logado ? trancado : false, () => setTrancado(false)];
}

function Rotas() {
  const { usuario, carregando } = useAuth();
  const { cores, modo } = useTema();
  const [trancado, destrancar] = useTrava(!!usuario && !usuario.trocarSenha, !carregando);

  // ao sair do app, o widget da tela inicial do Android é refeito com o que mudou aqui dentro
  // (favorita trocada, saída da conta)
  useEffect(() => {
    const ouvinte = AppState.addEventListener('change', estado => { if (estado === 'background') atualizarWidget(); });
    return () => ouvinte.remove();
  }, []);

  // Aviso de câmera fora do ar: ao abrir já logado, confirma o registro deste aparelho; e quem
  // tocou num aviso cai direto na câmera (depois de destrancar, se a trava estiver ligada).
  const router = useRouter();
  const liberado = !!usuario && !usuario.trocarSenha && !usuario.termosPendentes && trancado === false;
  const cameraDoAviso = useCameraDoAviso();
  // primeiro login neste aparelho: escolher o idioma (antes do convite de digital e avisos)
  const [idiomaPendente, idiomaEscolhido] = useIdiomaPendente();
  const avisoAberto = useRef<number | null>(null);
  useEffect(() => { if (liberado) void confirmarAvisos(); }, [liberado]);
  useEffect(() => {
    if (!liberado || cameraDoAviso === null || avisoAberto.current === cameraDoAviso) return;
    avisoAberto.current = cameraDoAviso;
    router.push({ pathname: '/camera/[id]', params: { id: String(cameraDoAviso) } });
  }, [liberado, cameraDoAviso, router]);

  // Se a fonte falhar, segue com a do sistema em vez de travar na tela de espera
  const [fontesProntas, erroFontes] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  if (carregando || trancado === null || (!fontesProntas && !erroFontes)) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.fundo, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={cores.azul} />
      </View>
    );
  }

  // trancado: esta tela fica no lugar de todas as outras, e nenhuma câmera é carregada
  if (trancado) {
    return (
      <>
        <StatusBar style={temaEscuro(modo) ? 'light' : 'dark'} />
        <Trancado aoDestrancar={destrancar} />
      </>
    );
  }

  // termos de uso novos (ou primeiro acesso): a janela do aceite fica no lugar das outras telas
  if (usuario && !usuario.trocarSenha && usuario.termosPendentes) {
    return (
      <>
        <StatusBar style={temaEscuro(modo) ? 'light' : 'dark'} />
        <AceiteTermos />
      </>
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
          <Stack.Screen name="tv" options={{ title: tr('Modo TV'), animation: 'fade' }} />
          <Stack.Screen name="mural" options={{ title: tr('Mural de avisos') }} />
          <Stack.Screen name="acessos" options={{ title: tr('Meus acessos') }} />
        </Stack.Protected>


        {/* Tela do síndico: a ficha de um morador (a lista fica na aba Gestão) */}
        <Stack.Protected guard={ehSindico(usuario?.role) && !usuario?.trocarSenha}>
          <Stack.Screen name="sindico/morador" options={{ title: tr('Morador') }} />
        </Stack.Protected>

        <Stack.Protected guard={!usuario}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="recuperar-senha" options={{ headerShown: false }} />
          {/* o link do convite do síndico: cria a conta e já entra */}
          <Stack.Screen name="convite/[codigo]" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      {/* digital e aviso de câmera parada: convite logo depois do login (some sozinho) */}
      {liberado && idiomaPendente === true && <EscolherIdioma aoEscolher={idiomaEscolhido} />}
      {liberado && idiomaPendente === false && <AtivarProtecoes />}
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
