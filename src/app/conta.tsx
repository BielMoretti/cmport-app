import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Cabecalho } from '@/components/ui';
import { Botao, Campo, confirmar, LinhaInfo, Mensagem, Secao } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';

/** Minha conta: quem está logado, trocar a própria senha (POST /auth/trocar-senha) e sair. */
export default function ContaScreen() {
  const { usuario, logout } = useAuth();
  const styles = useEstilos(criarEstilos);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const diferente = nova !== '' && repetida !== '' && nova !== repetida;
  const podeTrocar = atual !== '' && nova.length >= 6 && nova === repetida && nova !== atual;

  async function trocar() {
    if (!podeTrocar) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      await api('/auth/trocar-senha', { method: 'POST', body: { senha_atual: atual, senha_nova: nova } });
      setAtual(''); setNova(''); setRepetida('');
      setAviso('Senha trocada. Use a nova na próxima vez que entrar.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function sair() {
    if (await confirmar('Sair da conta?', 'Você vai precisar do email e da senha para entrar de novo.', 'Sair')) {
      await logout();
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={'Minha conta'} />
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {usuario && (
          <View>
            <Text style={styles.nome}>{usuario.nome}</Text>
            <LinhaInfo rotulo="Nível de acesso" valor={NOME_DO_PAPEL[usuario.role] ?? usuario.role} />
          </View>
        )}

        <Secao titulo="Trocar a senha">
          <Campo rotulo="Senha atual" value={atual} onChangeText={setAtual} secureTextEntry autoComplete="current-password" />
          <Campo rotulo="Senha nova" value={nova} onChangeText={setNova} secureTextEntry autoComplete="new-password" ajuda="Pelo menos 6 caracteres, diferente da atual." />
          <Campo rotulo="Repita a senha nova" value={repetida} onChangeText={setRepetida} secureTextEntry autoComplete="new-password" />
          {diferente && <Mensagem texto="As duas senhas novas não são iguais." tom="erro" />}
          {erro && <Mensagem texto={erro} tom="erro" />}
          {aviso && <Mensagem texto={aviso} tom="azul" />}
          <Botao titulo="Trocar senha" onPress={trocar} carregando={salvando} desabilitado={!podeTrocar} />
        </Secao>

        <Botao titulo="Sair da conta" variante="perigo" onPress={() => { void sair(); }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[6] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
});
