import { useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import BotaoTema from '@/components/BotaoTema';
import { Toque } from '@/components/efeitos';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, type Paleta } from '@/lib/tema';

export default function LoginScreen() {
  const { login } = useAuth();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [foco, setFoco] = useState<'email' | 'senha' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

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
      <View style={styles.topo}>
        <BotaoTema />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {/* O logo foi desenhado para fundo branco — no tema preto ele ganha um disco claro */}
        <View style={styles.logoFundo}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="CM Port" />
        </View>

        <Text style={styles.titulo}>Câmeras dos condomínios</Text>
        <Text style={styles.apoio}>Entre com o mesmo email e senha do sistema.</Text>

        <View style={styles.formulario}>
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
            {enviando ? <ActivityIndicator color={cores.sobreAzul} /> : <Text style={styles.botaoTexto}>Entrar</Text>}
          </Toque>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  topo: { alignItems: 'flex-end', paddingHorizontal: espaco[4], paddingTop: componentes.alvoDeToque },
  conteudo: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: espaco[7], paddingBottom: espaco[12], maxWidth: componentes.tela.larguraMaxFormulario, width: '100%', alignSelf: 'center' },
  logoFundo: {
    width: componentes.logo.disco, height: componentes.logo.disco, borderRadius: componentes.logo.disco / 2, backgroundColor: palco.fundoDoLogo,
    alignItems: 'center', justifyContent: 'center', marginBottom: espaco[6], boxShadow: c.brilho,
  },
  logo: { width: componentes.logo.largura, height: componentes.logo.altura },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.destaque, lineHeight: entrelinha.destaque, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, marginTop: espaco[1.5] },
  formulario: { marginTop: espaco[7], gap: espaco[4] },
  rotulo: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.texto, marginBottom: espaco[1.5] },
  campo: {
    backgroundColor: c.superficie, borderColor: c.linha, borderWidth: 1, borderRadius: raio.medio,
    fontFamily: fontes.texto, fontSize: corpo.nome, color: c.texto, paddingHorizontal: espaco[3.5], paddingVertical: espaco[3],
  },
  campoFoco: { borderColor: c.azul, boxShadow: c.brilho },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.erro },
  botao: { backgroundColor: c.azul, borderRadius: raio.medio, alignItems: 'center', justifyContent: 'center', minHeight: componentes.botao.altura, marginTop: espaco[1] },
  botaoPronto: { boxShadow: c.brilho },
  botaoDesabilitado: { opacity: 0.4 },
  botaoTexto: { fontFamily: fontes.nome, fontSize: corpo.nome, color: c.sobreAzul },
});
