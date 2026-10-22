import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Botao, Campo, Mensagem } from '@/components/formulario';
import { Tela } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { aceitarConvite, verConvite, type ConvitePublico } from '@/lib/convites';
import { tr, trDoServidor } from '@/lib/idioma';
import { cpfValido, formatarCpf } from '@/lib/perfil';
import { abrirPolitica, abrirTermos } from '@/lib/suporte';
import { componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';

/**
 * Convite do síndico (o link cmport://convite/<código>, aberto pela página do convite ou pelo
 * próprio link): a pessoa cria a conta — nome, e-mail, CPF, senha, aceite dos termos — e já
 * entra no condomínio. Quem já tem conta por outro condomínio usa o mesmo e-mail e a senha
 * dela. Depois do aceite, o app faz o login normal (que registra este aparelho).
 * Só aparece para quem não está logado (ver _layout.tsx).
 */
export default function ConviteScreen() {
  const styles = useEstilos(criarEstilos);
  const router = useRouter();
  const { login } = useAuth();
  const { codigo } = useLocalSearchParams<{ codigo: string }>();
  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  const [erroConvite, setErroConvite] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    verConvite(String(codigo ?? ''))
      .then(c => { if (vivo) setConvite(c); })
      .catch(e => { if (vivo) setErroConvite(e instanceof ApiError ? trDoServidor(e.message) : tr('Não foi possível abrir o convite. Confira a internet.')); });
    return () => { vivo = false; };
  }, [codigo]);

  const senhasDiferentes = repetida.length > 0 && senha !== repetida;
  const pode = nome.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim()) && cpfValido(cpf) && senha.length >= 6
    && senha === repetida && marcado && !enviando;

  async function entrar() {
    if (!pode || !convite) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await aceitarConvite(String(codigo), {
        nome: nome.trim(), email: email.trim().toLowerCase(), cpf: cpf.replace(/\D/g, ''),
        ...(telefone.trim() ? { telefone: telefone.trim() } : {}), senha, aceito_termos: true, versao_termos: convite.termos_vigentes,
      });
      // conta pronta: entra como num login normal (o _layout leva para o início)
      await login(r.email, senha);
    } catch (e) {
      setErro(e instanceof ApiError && e.status !== 422 ? trDoServidor(e.message) : tr('Confira os dados digitados.'));
      setEnviando(false);
    }
  }

  return (
    <Tela>
      <KeyboardAvoidingView behavior="padding" style={styles.tela}>
        <ScrollView contentContainerStyle={styles.centro} keyboardShouldPersistTaps="handled">
          <View style={styles.janela}>
            <View style={styles.fio} pointerEvents="none" />
            {!convite && !erroConvite && <Text style={styles.apoio}>{tr('Abrindo o convite…')}</Text>}

            {erroConvite && (
              <>
                <Text style={styles.titulo} accessibilityRole="header">{tr('Convite indisponível')}</Text>
                <Mensagem texto={erroConvite} tom="erro" />
                <Botao titulo={tr('Ir para o login')} variante="secundario" onPress={() => router.replace('/login')} />
              </>
            )}

            {convite && (
              <>
                <Text style={styles.titulo} accessibilityRole="header">
                  {convite.condominio_nome ? tr('Câmeras do {0}', [convite.condominio_nome]) : tr('Seu convite')}
                </Text>
                <Text style={styles.apoio}>
                  {tr('Unidade {0}', [convite.unidade])}{convite.sindico_nome ? tr(' · convite de {0}', [convite.sindico_nome]) : ''}
                </Text>
                <Text style={styles.apoio}>{tr('Crie o seu acesso. Já tem conta no CM Port por outro condomínio? Use o mesmo e-mail e a senha de sempre.')}</Text>

                <Campo rotulo={tr('Nome completo')} value={nome} onChangeText={setNome} autoComplete="name" maxLength={150} />
                <Campo rotulo={tr('Email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
                <Campo
                  rotulo={tr('CPF')} value={formatarCpf(cpf)} onChangeText={t => setCpf(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad"
                  ajuda={cpf.length === 11 && !cpfValido(cpf) ? tr('Este CPF não é válido. Confira os números.') : undefined}
                />
                <Campo rotulo={tr('Telefone (opcional)')} value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" autoComplete="tel" maxLength={20} />
                <Campo rotulo={tr('Senha')} value={senha} onChangeText={setSenha} secureTextEntry autoComplete="new-password" ajuda={tr('Pelo menos 6 caracteres.')} />
                <Campo rotulo={tr('Repita a senha')} value={repetida} onChangeText={setRepetida} secureTextEntry autoComplete="new-password" />
                {senhasDiferentes && <Mensagem texto={tr('As duas senhas não são iguais.')} tom="erro" />}

                <View style={styles.links}>
                  <Pressable onPress={() => { void abrirTermos(); }} accessibilityRole="link" hitSlop={espaco[2]}>
                    <Text style={styles.link}>{tr('Ler os Termos de uso')}</Text>
                  </Pressable>
                  <Pressable onPress={() => { void abrirPolitica(); }} accessibilityRole="link" hitSlop={espaco[2]}>
                    <Text style={styles.link}>{tr('Ler a Política de privacidade')}</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => setMarcado(m => !m)} accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} style={styles.marcar}>
                  <View style={[styles.caixa, marcado && styles.caixaMarcada]}>{marcado && <Text style={styles.visto}>✓</Text>}</View>
                  <Text style={styles.marcarTexto}>{tr('Tenho 18 anos ou mais e li e aceito os Termos de uso e a Política de privacidade.')}</Text>
                </Pressable>

                {erro && <Mensagem texto={erro} tom="erro" />}
                <Botao titulo={tr('Criar meu acesso')} onPress={() => { void entrar(); }} carregando={enviando} desabilitado={!pode} />
                <Botao titulo={tr('Já tenho conta: ir para o login')} variante="secundario" onPress={() => router.replace('/login')} desabilitado={enviando} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Tela>
  );
}

const CAIXA = 24;

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  centro: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: espaco[5] },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, gap: espaco[4], overflow: 'hidden',
    ...vidro(c, 'flutuante'), borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6],
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo + espaco[1], lineHeight: entrelinha.destaque, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  links: { gap: espaco[3] },
  link: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul, textDecorationLine: 'underline' },
  marcar: { flexDirection: 'row', gap: espaco[3], alignItems: 'flex-start', minHeight: componentes.alvoDeToque, paddingVertical: espaco[1] },
  caixa: {
    width: CAIXA, height: CAIXA, borderRadius: raio.pequeno - 4, borderWidth: 2, borderColor: c.textoSuave,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  caixaMarcada: { backgroundColor: c.azul, borderColor: c.azul },
  visto: { fontFamily: fontes.nome, fontSize: corpo.base, lineHeight: CAIXA - 4, color: c.sobreLuz },
  marcarTexto: { flex: 1, fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
});
