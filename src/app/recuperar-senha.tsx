import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Fitas } from '@/components/arte';
import BotaoTema from '@/components/BotaoTema';
import CampoDeCodigo from '@/components/CampoDeCodigo';
import { Botao, Campo, Mensagem } from '@/components/formulario';
import { useEstilos } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';
import { idiomaAtual, tr, trDoServidor } from '@/lib/idioma';

// entre um pedido de código e o seguinte o servidor exige 1 minuto
const ESPERA_PARA_REENVIAR = 60;

/**
 * Esqueci minha senha. Duas etapas no mesmo cartão: (1) a pessoa diz o email e o servidor manda
 * um código de 6 números para ele; (2) ela digita o código e cria a senha nova.
 *
 * Regras que são do servidor, e o app só explica: o código vale 15 minutos, serve uma vez e só
 * funciona no celular em que a conta já entrou — trocar de aparelho continua sendo com a CM Port.
 * Por segurança a resposta do pedido é sempre a mesma, exista ou não o cadastro.
 */
export default function RecuperarSenhaScreen() {
  const router = useRouter();
  const styles = useEstilos(criarEstilos);
  const params = useLocalSearchParams<{ email?: string }>();

  const [etapa, setEtapa] = useState<'email' | 'codigo' | 'pronto'>('email');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [codigo, setCodigo] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const [aceito, setAceito] = useState(false);

  // conta para baixo até poder pedir outro código
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const emailLimpo = email.trim().toLowerCase();
  const emailValido = /\S+@\S+\.\S+/.test(emailLimpo);
  const diferente = nova !== '' && repetida !== '' && nova !== repetida;
  const podeSalvar = codigo.length === 6 && nova.length >= 6 && nova === repetida;

  async function pedirCodigo() {
    if (!emailValido || enviando || espera > 0) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<{ mensagem: string }>('/auth/esqueci-senha', { method: 'POST', body: { email: emailLimpo, idioma: idiomaAtual() } });
      setAviso(trDoServidor(r.mensagem));
      setCodigo('');
      setAceito(false);
      setEtapa('codigo');
      setEspera(ESPERA_PARA_REENVIAR);
    } catch (e) {
      setErro(e instanceof ApiError && e.status !== 422 ? e.message : tr('Confira o email digitado.'));
    } finally {
      setEnviando(false);
    }
  }

  async function salvar() {
    if (!podeSalvar || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api('/auth/redefinir-senha', { method: 'POST', body: { email: emailLimpo, codigo, senha_nova: nova } });
      // o código fica verde com ✓ por um instante antes da tela de pronto
      setAceito(true);
      setTimeout(() => setEtapa('pronto'), 900);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível salvar a senha. Tente de novo.'));
    } finally {
      setEnviando(false);
    }
  }

  const voltarAoLogin = () => router.replace({ pathname: '/login', params: { email: emailLimpo } });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Fitas />
      <View style={styles.topo}>
        <BotaoTema />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.cartao}>
          <View style={styles.fio} pointerEvents="none" />

          {etapa === 'email' && (
            <>
              <Text style={styles.titulo} accessibilityRole="header">{tr('Esqueci minha senha')}</Text>
              <Text style={styles.apoio}>
                {tr('Diga o email da sua conta. Enviamos um código de 6 números para ele, e com o código você cria uma senha nova.')}
              </Text>
              <Campo
                rotulo={tr('Email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
                autoComplete="email" keyboardType="email-address" autoFocus onSubmitEditing={() => { void pedirCodigo(); }}
              />
              <Mensagem texto={tr('O código só funciona neste celular, se for o mesmo em que a conta já entrou. Trocou de aparelho? Fale com a CM Port.')} />
              {erro && <Mensagem texto={erro} tom="erro" />}
              <Botao titulo={tr('Enviar código')} onPress={() => { void pedirCodigo(); }} carregando={enviando} desabilitado={!emailValido} />
              <Botao titulo={tr('Voltar para o login')} variante="secundario" onPress={voltarAoLogin} desabilitado={enviando} />
            </>
          )}

          {etapa === 'codigo' && (
            <>
              <Text style={styles.titulo} accessibilityRole="header">{tr('Digite o código')}</Text>
              <Text style={styles.apoio}>
                {aviso ?? tr('Se este email tiver cadastro, enviamos um código de 6 números.')} {tr('Olhe também a caixa de spam de ')}{emailLimpo}.
              </Text>
              <Text style={styles.rotuloCodigo}>{tr('Código de 6 números')}</Text>
              <CampoDeCodigo value={codigo} onChange={setCodigo} aceito={aceito} autoFocus />
              <Campo rotulo={tr('Senha nova')} value={nova} onChangeText={setNova} secureTextEntry autoComplete="new-password" ajuda={tr('Pelo menos 6 caracteres.')} />
              <Campo rotulo={tr('Repita a senha nova')} value={repetida} onChangeText={setRepetida} secureTextEntry autoComplete="new-password" onSubmitEditing={() => { void salvar(); }} />
              {diferente && <Mensagem texto={tr('As duas senhas não são iguais.')} tom="erro" />}
              {erro && <Mensagem texto={erro} tom="erro" />}
              <Botao titulo={tr('Salvar senha nova')} onPress={() => { void salvar(); }} carregando={enviando} desabilitado={!podeSalvar} />
              <Botao
                titulo={espera > 0 ? tr('Enviar outro código em {0} s', [espera]) : tr('Enviar outro código')}
                variante="secundario" onPress={() => { void pedirCodigo(); }} desabilitado={enviando || espera > 0}
              />
              <Botao titulo={tr('Trocar o email')} variante="secundario" onPress={() => { setEtapa('email'); setErro(null); }} desabilitado={enviando} />
            </>
          )}

          {etapa === 'pronto' && (
            <>
              <Text style={styles.titulo} accessibilityRole="header">{tr('Senha criada')}</Text>
              <Text style={styles.apoio}>{tr('Pronto. Agora é só entrar com o seu email e a senha nova.')}</Text>
              <Botao titulo={tr('Ir para o login')} onPress={voltarAoLogin} />
            </>
          )}
        </View>
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
  // o mesmo cartão de vidro do login
  cartao: {
    ...vidro(c, 'forte'), borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6], gap: espaco[4], overflow: 'hidden',
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.destaque, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  rotuloCodigo: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave, marginBottom: 0 },
});
