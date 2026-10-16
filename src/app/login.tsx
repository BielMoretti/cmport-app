import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Fitas, Reflexo } from '@/components/arte';
import BotaoTema from '@/components/BotaoTema';
import { NATIVO, Toque, useReduzirMovimento } from '@/components/efeitos';
import { LogoPlaca } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError, consumirMotivoDaSaida } from '@/lib/api';
import { aceso, componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';
import { tr } from '@/lib/idioma';
import { abrirPolitica } from '@/lib/suporte';

// Freio no aparelho: depois de 5 senhas erradas seguidas, o botão espera 1 minuto. Não é a
// proteção de verdade (quem quiser contorna) — essa é a trava do servidor, que responde 429.
const ERROS_ATE_O_FREIO = 5;
const SEGUNDOS_DE_FREIO = 60;
let errosSeguidos = 0;       // fora do componente: sobrevive a sair e voltar da tela
let liberadoEm = 0;

export default function LoginScreen() {
  const { login } = useAuth();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const router = useRouter();
  // quem volta de "esqueci minha senha" já encontra o email preenchido
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [senha, setSenha] = useState('');
  const [foco, setFoco] = useState<'email' | 'senha' | null>(null);
  // se o app saiu da conta sozinho (aberta em outro aparelho), a tela de login diz por quê
  const [erro, setErro] = useState<string | null>(() => consumirMotivoDaSaida());
  const [enviando, setEnviando] = useState(false);
  const [larguraBotao, setLarguraBotao] = useState(0);
  const [espera, setEspera] = useState(() => Math.max(0, Math.ceil((liberadoEm - Date.now()) / 1000)));

  // conta o freio para baixo, de segundo em segundo
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(Math.max(0, Math.ceil((liberadoEm - Date.now()) / 1000))), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // Abertura: o cartão de vidro sobe e aparece
  const abertura = useRef(new Animated.Value(reduzir ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(abertura, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVO }).start();
  }, [abertura]);

  const podeEnviar = email.trim().length > 0 && senha.length > 0 && !enviando && espera === 0;

  async function entrar() {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);
    try {
      await login(email, senha);
      errosSeguidos = 0;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        errosSeguidos += 1;
        if (errosSeguidos >= ERROS_ATE_O_FREIO) {
          errosSeguidos = 0;
          liberadoEm = Date.now() + SEGUNDOS_DE_FREIO * 1000;
          setEspera(SEGUNDOS_DE_FREIO);
        }
      }
      // 422 = email fora do formato; o backend responde uma lista técnica, não uma frase.
      // 429 = o servidor travou as tentativas e já diz em quanto tempo libera.
      setErro(e instanceof ApiError && e.status !== 422 ? e.message : tr('Confira o email digitado.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Fitas />

      <View style={styles.topo}>
        <BotaoTema />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Animated.View
          style={[
            styles.cartao,
            {
              opacity: abertura,
              transform: [{ translateY: abertura.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
            },
          ]}
        >
          <View style={styles.fio} pointerEvents="none" />
          <View style={styles.marca}>
            <LogoPlaca tamanho={componentes.logoPlaca.entrada} />
            <Text style={styles.nomeMarca}>CM PORT</Text>
            <Text style={styles.lema}>{tr('Seu condomínio ao vivo, na palma da mão.')}</Text>
          </View>

          <View>
            <Text style={styles.rotulo}>{tr('Email')}</Text>
            <TextInput
              style={[styles.campo, foco === 'email' && styles.campoFoco]}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFoco('email')}
              onBlur={() => setFoco(null)}
            />
          </View>
          <View>
            <Text style={styles.rotulo}>{tr('Senha')}</Text>
            <TextInput
              style={[styles.campo, foco === 'senha' && styles.campoFoco]}
              secureTextEntry
              autoComplete="password"
              value={senha}
              onChangeText={setSenha}
              onSubmitEditing={entrar}
              onFocus={() => setFoco('senha')}
              onBlur={() => setFoco(null)}
            />
          </View>

          {erro && <Text style={styles.erro} accessibilityRole="alert">{erro}</Text>}
          {espera > 0 && (
            <Text style={styles.erro} accessibilityLiveRegion="polite">
              {tr('Muitas tentativas. Aguarde ')}{espera} {espera === 1 ? tr('segundo') : tr('segundos')} {tr('para tentar de novo.')}
            </Text>
          )}

          <Toque
            onPress={entrar}
            disabled={!podeEnviar}
            accessibilityRole="button"
            style={[styles.botao, podeEnviar ? styles.botaoPronto : styles.botaoDesabilitado]}
          >
            <View style={styles.botaoMiolo} onLayout={e => setLarguraBotao(e.nativeEvent.layout.width)}>
              {podeEnviar && <Reflexo largura={larguraBotao} />}
              {enviando ? <ActivityIndicator color={cores.sobreLuz} /> : <Text style={styles.botaoTexto}>{tr('Entrar')}</Text>}
            </View>
          </Toque>

          <Pressable
            onPress={() => router.push({ pathname: '/recuperar-senha', params: { email: email.trim() } })}
            accessibilityRole="link" hitSlop={espaco[3]} style={styles.esqueciArea}
          >
            <Text style={styles.esqueci}>{tr('Esqueci minha senha')}</Text>
          </Pressable>
          <Pressable onPress={() => { void abrirPolitica(); }} accessibilityRole="link" hitSlop={espaco[2]} style={styles.esqueciArea}>
            <Text style={styles.politica}>{tr('Política de privacidade')}</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  topo: { alignItems: 'flex-end', paddingHorizontal: espaco[4], paddingTop: componentes.alvoDeToque },
  conteudo: {
    flexGrow: 1, justifyContent: 'center', paddingHorizontal: espaco[5], paddingBottom: espaco[12],
    maxWidth: componentes.tela.larguraMaxFormulario, width: '100%', alignSelf: 'center',
  },
  // um cartão de vidro só, com a marca e o formulário dentro
  cartao: {
    ...vidro(c, 'forte'), borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[8], paddingBottom: espaco[7], gap: espaco[4], overflow: 'hidden',
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  esqueciArea: { minHeight: componentes.alvoDeToque, alignItems: 'center', justifyContent: 'center' },
  esqueci: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul, textAlign: 'center' },
  politica: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, textAlign: 'center', textDecorationLine: 'underline' },
  marca: { alignItems: 'center', justifyContent: 'center', marginBottom: espaco[3] },
  nomeMarca: {
    fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.destaque, color: c.texto,
    letterSpacing: espaco[1.5], marginTop: espaco[4], paddingLeft: espaco[1.5],
  },
  lema: {
    fontFamily: fontes.texto, fontSize: corpo.legenda, lineHeight: entrelinha.base, color: c.textoSuave,
    marginTop: espaco[0.5], textAlign: 'center',
  },
  rotulo: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave, marginBottom: espaco[1.5] },
  campo: {
    ...vidro(c), borderRadius: componentes.campo.raio,
    fontFamily: fontes.texto, fontSize: corpo.nome, color: c.texto,
    paddingHorizontal: componentes.campo.respiroH, paddingVertical: componentes.campo.respiroV,
  },
  campoFoco: { borderColor: c.azul, boxShadow: c.brilho },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.erro },
  botao: {
    ...aceso(c), borderRadius: componentes.botao.raio, minHeight: componentes.botao.altura,
    marginTop: espaco[2], overflow: 'hidden',
  },
  botaoMiolo: { flex: 1, minHeight: componentes.botao.altura, alignItems: 'center', justifyContent: 'center' },
  botaoPronto: {},
  botaoDesabilitado: { opacity: 0.55, boxShadow: 'none' },
  botaoTexto: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.sobreLuz },
});
