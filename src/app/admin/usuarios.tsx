import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Cabecalho } from '@/components/ui';
import { BarraCarregando } from '@/components/efeitos';
import { Botao, Campo, Mensagem, Opcoes, Secao, Selo } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { niveisQuePodeDar, NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Role, Usuario } from '@/lib/types';

/**
 * Usuários do sistema (GET/POST /usuarios — DEV e ADMIN_MASTER).
 * São os mesmos logins do sistema web: mexer aqui vale para os dois.
 * Tocar num usuário abre a ficha dele (nível, senha, bloqueio, condomínios).
 */
export default function UsuariosScreen() {
  const router = useRouter();
  const { usuario: eu } = useAuth();
  const styles = useEstilos(criarEstilos);
  const niveis = niveisQuePodeDar(eu?.role);
  const opcoes = niveis.map(valor => ({ valor, rotulo: NOME_DO_PAPEL[valor] }));

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Role>('MORADOR');
  const [criando, setCriando] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setUsuarios(await api<Usuario[]>('/usuarios'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os usuários.');
    }
  }, []);

  // recarrega ao voltar da ficha de um usuário
  useFocusEffect(useCallback(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]));

  const podeCriar = nome.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim()) && senha.length >= 6;

  async function criar() {
    if (!podeCriar) return;
    setCriando(true);
    setErroNovo(null);
    try {
      const novo = await api<Usuario>('/usuarios', {
        method: 'POST',
        body: { nome: nome.trim(), email: email.trim().toLowerCase(), senha, role: papel },
      });
      setNome(''); setEmail(''); setSenha('');
      // morador recém-criado não vê nada até ganhar condomínios — abre a ficha direto
      router.push({ pathname: '/admin/usuario', params: { id: String(novo.id) } });
    } catch (e) {
      setErroNovo(
        e instanceof ApiError && e.status === 422
          ? 'O servidor não aceitou esses dados. Se o nível for Morador, ele ainda não existe no servidor.'
          : e instanceof ApiError ? e.message : 'Não foi possível criar o usuário. Tente de novo.',
      );
    } finally {
      setCriando(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={'Usuários'} />
      <BarraCarregando ativa={carregando} />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Mensagem texto="São os mesmos logins do sistema web. Morador só assiste as câmeras dos condomínios liberados para ele; técnico e administradores também cadastram." />
        {erro && <Mensagem texto={erro} tom="erro" />}

        <Secao titulo="Quem tem acesso">
          {usuarios.map(u => (
            <Pressable
              key={u.id}
              onPress={() => router.push({ pathname: '/admin/usuario', params: { id: String(u.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`Abrir a ficha de ${u.nome}`}
              style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
            >
              <View style={styles.cartaoTexto}>
                <Text style={styles.nome} numberOfLines={1}>{u.nome}</Text>
                <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
              </View>
              {!u.ativo && <Selo texto="Bloqueado" tom="erro" />}
              <Selo texto={NOME_DO_PAPEL[u.role] ?? u.role} tom={u.role === 'MORADOR' ? 'suave' : 'azul'} />
            </Pressable>
          ))}
          {!carregando && usuarios.length === 0 && !erro && <Mensagem texto="Nenhum usuário cadastrado." />}
        </Secao>

        <Secao titulo="Novo usuário">
          <Campo rotulo="Nome" value={nome} onChangeText={setNome} />
          <Campo rotulo="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          <Campo rotulo="Senha inicial" value={senha} onChangeText={setSenha} secureTextEntry ajuda="Pelo menos 6 caracteres. A pessoa pode trocar depois." />
          <Opcoes rotulo="Nível de acesso" valor={papel} opcoes={opcoes} onChange={setPapel} />
          {erroNovo && <Mensagem texto={erroNovo} tom="erro" />}
          <Botao titulo="Criar usuário" onPress={criar} carregando={criando} desabilitado={!podeCriar} />
        </Secao>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[6] },
  cartao: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[2], minHeight: componentes.linha.alturaMin + espaco[2],
    backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha,
    paddingHorizontal: espaco[4], paddingVertical: espaco[3],
  },
  cartaoPressionado: { borderColor: c.azul, boxShadow: c.brilho },
  cartaoTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  email: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
});
