import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';

import { BarraCarregando } from '@/components/efeitos';
import { Alternador, Botao, Campo, confirmar, Mensagem, Opcoes, Secao, Selo } from '@/components/formulario';
import { useEstilos } from '@/contexts/TemaContext';
import { NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Role, Usuario } from '@/lib/types';

const PAPEIS: { valor: Role; rotulo: string }[] = [
  { valor: 'USUARIO', rotulo: NOME_DO_PAPEL.USUARIO },
  { valor: 'ADMIN', rotulo: NOME_DO_PAPEL.ADMIN },
  { valor: 'DEV', rotulo: NOME_DO_PAPEL.DEV },
];

/**
 * Usuários do sistema (rotas /dev/usuarios do backend — só o papel DEV entra).
 * Os usuários são os mesmos do sistema web: mexer aqui vale para os dois.
 */
export default function UsuariosScreen() {
  const styles = useEstilos(criarEstilos);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [meuId, setMeuId] = useState<number | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Role>('USUARIO');
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setUsuarios(await api<Usuario[]>('/dev/usuarios'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os usuários.');
    }
  }, []);

  useEffect(() => {
    carregar().finally(() => setCarregando(false));
    api<{ id: number }>('/auth/me').then(eu => setMeuId(eu.id)).catch(() => {});
  }, [carregar]);

  async function alterar(u: Usuario, mudanca: { role?: Role; ativo?: boolean }) {
    if (mudanca.ativo === false) {
      const ok = await confirmar('Bloquear este usuário?', `${u.nome} deixa de conseguir entrar no app e no sistema web.`, 'Bloquear');
      if (!ok) return;
    }
    if (mudanca.role && mudanca.role !== 'USUARIO' && u.role === 'USUARIO') {
      const ok = await confirmar(
        'Dar acesso de administração?',
        `${u.nome} vai poder criar, editar e desativar postes e câmeras, aqui e no sistema web.`,
        'Dar acesso',
      );
      if (!ok) return;
    }
    setOcupado(u.id);
    setErro(null);
    try {
      const novo = await api<Usuario>(`/dev/usuarios/${u.id}`, { method: 'PATCH', body: mudanca });
      setUsuarios(lista => lista.map(x => (x.id === novo.id ? novo : x)));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível alterar. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  const podeCriar = nome.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim()) && senha.length >= 6;

  async function criar() {
    if (!podeCriar) return;
    setCriando(true);
    setErro(null);
    setAviso(null);
    try {
      const novo = await api<Usuario>('/dev/usuarios', {
        method: 'POST',
        body: { nome: nome.trim(), email: email.trim().toLowerCase(), senha, role: papel },
      });
      setUsuarios(lista => [...lista, novo]);
      setAviso(`${novo.nome} criado como ${NOME_DO_PAPEL[novo.role].toLowerCase()}.`);
      setNome(''); setEmail(''); setSenha(''); setPapel('USUARIO');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível criar o usuário. Tente de novo.');
    } finally {
      setCriando(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Stack.Screen options={{ title: 'Usuários' }} />
      <BarraCarregando ativa={carregando} />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Mensagem texto="São os mesmos usuários do sistema web. O papel define o que cada um vê no app: morador só assiste; administrador ganha a aba de administração." />
        {erro && <Mensagem texto={erro} tom="erro" />}

        <Secao titulo="Quem tem acesso">
          {usuarios.map(u => (
            <View key={u.id} style={[styles.cartao, ocupado === u.id && styles.ocupado]}>
              <View style={styles.cartaoCabeca}>
                <View style={styles.cartaoTexto}>
                  <Text style={styles.nome} numberOfLines={1}>{u.nome}</Text>
                  <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
                </View>
                {!u.ativo && <Selo texto="Bloqueado" tom="erro" />}
              </View>
              {u.id === meuId ? (
                // mexer na própria conta poderia trancar a pessoa pra fora
                <Mensagem texto={`Esta é a sua conta (${NOME_DO_PAPEL[u.role].toLowerCase()}). Para alterá-la, peça a outro desenvolvedor.`} />
              ) : (
                <>
                  <Opcoes rotulo="Papel" valor={u.role} opcoes={PAPEIS} onChange={role => { if (role !== u.role) void alterar(u, { role }); }} />
                  <Alternador rotulo="Pode entrar" valor={u.ativo} onChange={ativo => { void alterar(u, { ativo }); }} />
                </>
              )}
            </View>
          ))}
          {!carregando && usuarios.length === 0 && !erro && <Mensagem texto="Nenhum usuário cadastrado." />}
        </Secao>

        <Secao titulo="Novo usuário">
          <Campo rotulo="Nome" value={nome} onChangeText={setNome} />
          <Campo rotulo="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          <Campo rotulo="Senha inicial" value={senha} onChangeText={setSenha} secureTextEntry ajuda="Pelo menos 6 caracteres. Passe para a pessoa por um canal seguro." />
          <Opcoes rotulo="Papel" valor={papel} opcoes={PAPEIS} onChange={setPapel} />
          {aviso && <Mensagem texto={aviso} tom="azul" />}
          <Botao titulo="Criar usuário" onPress={criar} carregando={criando} desabilitado={!podeCriar} />
        </Secao>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { padding: espaco[4], paddingBottom: espaco[10], gap: espaco[6] },
  cartao: {
    backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha,
    padding: espaco[4], gap: espaco[3],
  },
  ocupado: { opacity: 0.5 },
  cartaoCabeca: { flexDirection: 'row', alignItems: 'center', gap: espaco[3] },
  cartaoTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  email: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
});
