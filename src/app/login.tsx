import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { Fitas, Reflexo } from '@/components/arte';
import BotaoTema from '@/components/BotaoTema';
import { NATIVO, Toque, useReduzirMovimento } from '@/components/efeitos';
import { LogoPlaca } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { aceso, componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';

export default function LoginScreen() {
  const { login } = useAuth();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const reduzir = useReduzirMovimento();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [foco, setFoco] = useState<'email' | 'senha' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [larguraBotao, setLarguraBotao] = useState(0);

  // Abertura: o cartão de vidro sobe e aparece
  const abertura = useRef(new Animated.Value(reduzir ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(abertura, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVO }).start();
  }, [abertura]);

  const podeEnviar = email.trim().length > 0 && senha.length > 0 && !enviando;

  async function entrar() {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);
    try {
      await login(email, senha);
    } catch (e) {
      // 422 = email fora do formato; o backend responde uma lista técnica, não uma frase
      setErro(e instanceof ApiError && e.status !== 422 ? e.message : 'Confira o email digitado.');
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
            <Text style={styles.lema}>Seu condomínio ao vivo, na palma da mão.</Text>
          </View>

          <View>
            <Text style={styles.rotulo}>Email</Text>
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
            <Text style={styles.rotulo}>Senha</Text>
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

          <Toque
            onPress={entrar}
            disabled={!podeEnviar}
            accessibilityRole="button"
            style={[styles.botao, podeEnviar ? styles.botaoPronto : styles.botaoDesabilitado]}
          >
            <View style={styles.botaoMiolo} onLayout={e => setLarguraBotao(e.nativeEvent.layout.width)}>
              {podeEnviar && <Reflexo largura={larguraBotao} />}
              {enviando ? <ActivityIndicator color={cores.sobreLuz} /> : <Text style={styles.botaoTexto}>Entrar</Text>}
            </View>
          </Toque>
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
