import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { FundoVivo, Reflexo, Respiro } from '@/components/arte';
import BotaoTema from '@/components/BotaoTema';
import { NATIVO, Toque, useReduzirMovimento } from '@/components/efeitos';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';

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

  // Abertura: o leão surge primeiro, o formulário sobe em seguida
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
      <FundoVivo />

      <View style={styles.topo}>
        <BotaoTema />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Animated.View
          style={[
            styles.marca,
            {
              opacity: abertura,
              transform: [{ scale: abertura.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
            },
          ]}
        >
          <Respiro tamanho={componentes.leao.brilho} forca={0.75} />
          <Image source={require('../../assets/leao.png')} style={styles.leao} resizeMode="contain" accessibilityLabel="Leão da CM Port" />
          <Text style={styles.nomeMarca}>CM PORT</Text>
          <Text style={styles.lema}>Seu condomínio ao vivo, na palma da mão.</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.formulario,
            {
              opacity: abertura.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
              transform: [{ translateY: abertura.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
            },
          ]}
        >
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
  tela: { flex: 1, backgroundColor: c.fundo },
  topo: { alignItems: 'flex-end', paddingHorizontal: espaco[4], paddingTop: componentes.alvoDeToque },
  conteudo: {
    flexGrow: 1, justifyContent: 'center', paddingHorizontal: espaco[7], paddingBottom: espaco[12],
    maxWidth: componentes.tela.larguraMaxFormulario, width: '100%', alignSelf: 'center',
  },
  marca: { alignItems: 'center', justifyContent: 'center' },
  leao: { width: componentes.leao.largura, height: componentes.leao.altura },
  nomeMarca: {
    fontFamily: fontes.nome, fontSize: corpo.destaque, lineHeight: entrelinha.destaque, color: c.texto,
    letterSpacing: espaco[2], marginTop: espaco[3], paddingLeft: espaco[2],
  },
  lema: {
    fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave,
    marginTop: espaco[1], textAlign: 'center',
  },
  formulario: { marginTop: espaco[8], gap: espaco[4] },
  rotulo: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave, marginBottom: espaco[1.5] },
  campo: {
    backgroundColor: c.superficie, borderColor: c.linha, borderWidth: 1, borderRadius: componentes.campo.raio,
    fontFamily: fontes.texto, fontSize: corpo.nome, color: c.texto,
    paddingHorizontal: componentes.campo.respiroH, paddingVertical: componentes.campo.respiroV,
  },
  campoFoco: { borderColor: c.azul, boxShadow: c.brilho },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.erro },
  botao: {
    backgroundColor: c.luz, borderRadius: componentes.botao.raio, minHeight: componentes.botao.altura,
    marginTop: espaco[1], overflow: 'hidden',
  },
  botaoMiolo: { flex: 1, minHeight: componentes.botao.altura, alignItems: 'center', justifyContent: 'center' },
  botaoPronto: { boxShadow: c.brilho },
  botaoDesabilitado: { opacity: 0.55 },
  botaoTexto: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.sobreLuz },
});
