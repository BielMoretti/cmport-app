import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { GlifoMais } from '@/components/arte';
import { Cabecalho, Cartao } from '@/components/ui';
import { BarraCarregando, Toque } from '@/components/efeitos';
import { Alternador, Botao, Campo, Mensagem, Opcoes, Secao, Selo } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { niveisQuePodeDar, NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { aceso, componentes, corpo, entrelinha, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import type { Role, Usuario } from '@/lib/types';

/**
 * Moradores do condomínio do síndico (GET/POST /usuarios).
 * O servidor devolve só os moradores do condomínio de quem está logado e só deixa criar morador.
 * Em cima fica o botão de criar; tocar num morador abre a ficha dele (bloqueio, senha, aparelho
 * e os postes e câmeras que ele vê).
 */
export default function MoradoresScreen() {
  const router = useRouter();
  const { usuario: eu } = useAuth();
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  // ?novo=1 (vindo do botão da aba Gestão) já abre o formulário de criar
  const { novo: abrirNovo } = useLocalSearchParams<{ novo?: string }>();
  const niveis = niveisQuePodeDar(eu?.role);
  const opcoes = niveis.map(valor => ({ valor, rotulo: NOME_DO_PAPEL[valor] }));

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Role>('MORADOR');
  const [soUmAparelho, setSoUmAparelho] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [criandoAberto, setCriandoAberto] = useState(abrirNovo === '1');
  const [busca, setBusca] = useState('');

  useEffect(() => { if (abrirNovo === '1') setCriandoAberto(true); }, [abrirNovo]);

  const carregar = useCallback(async () => {
    try {
      setUsuarios((await api<Usuario[]>('/usuarios')).filter(u => u.role === 'MORADOR'));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os moradores.');
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
        body: { nome: nome.trim(), email: email.trim().toLowerCase(), senha, role: papel, so_um_aparelho: papel === 'MORADOR' && soUmAparelho },
      });
      setNome(''); setEmail(''); setSenha('');
      setSoUmAparelho(false);
      setCriandoAberto(false);
      // morador recém-criado não vê nada até ganhar postes ou câmeras — abre a ficha direto
      router.push({ pathname: '/sindico/morador', params: { id: String(novo.id) } });
    } catch (e) {
      setErroNovo(
        e instanceof ApiError && e.status === 422
          ? 'O servidor não aceitou esses dados. Confira o email e a senha.'
          : e instanceof ApiError ? e.message : 'Não foi possível criar o morador. Tente de novo.',
      );
    } finally {
      setCriando(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={'Moradores'} />
      <BarraCarregando ativa={carregando} />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {/* criar: primeiro item da tela, em destaque */}
        {niveis.length === 0 ? (
          <Mensagem texto="Só o síndico cria moradores." />
        ) : !criandoAberto ? (
          <Toque onPress={() => setCriandoAberto(true)} brilho accessibilityRole="button" accessibilityLabel="Criar morador" style={styles.criar}>
            <GlifoMais cor={cores.sobreLuz} tamanho={componentes.iconeCaixa.glifo} />
            <View style={styles.criarTexto}>
              <Text style={styles.criarTitulo}>Criar morador</Text>
              <Text style={styles.criarApoio}>Crie o login e escolha as câmeras que ele vê</Text>
            </View>
          </Toque>
        ) : (
          <Cartao destaque style={styles.formulario}>
            <Text style={styles.formularioTitulo} accessibilityRole="header">Novo morador</Text>
            <Campo rotulo="Nome" value={nome} onChangeText={setNome} autoFocus />
            <Campo rotulo="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            <Campo rotulo="Senha inicial" value={senha} onChangeText={setSenha} secureTextEntry ajuda="Pelo menos 6 caracteres. A pessoa pode trocar depois." />
            {opcoes.length > 1 && <Opcoes rotulo="Nível de acesso" valor={papel} opcoes={opcoes} onChange={setPapel} />}
            {papel === 'MORADOR' && (
              <Alternador
                rotulo="Só um aparelho"
                descricao="O primeiro celular que entrar fica registrado e só ele consegue usar este login. Se a pessoa passar a senha adiante, no outro celular não entra."
                valor={soUmAparelho}
                onChange={setSoUmAparelho}
              />
            )}
            {papel === 'MORADOR' && <Mensagem texto="Depois de criar, a ficha abre para você marcar os postes e as câmeras que este morador vai ver." />}
            {erroNovo && <Mensagem texto={erroNovo} tom="erro" />}
            <View style={styles.acoes}>
              <View style={styles.acao}><Botao titulo="Cancelar" variante="secundario" onPress={() => { setCriandoAberto(false); setErroNovo(null); }} desabilitado={criando} /></View>
              <View style={styles.acao}><Botao titulo="Criar morador" onPress={criar} carregando={criando} desabilitado={!podeCriar} /></View>
            </View>
          </Cartao>
        )}

        {erro && <Mensagem texto={erro} tom="erro" />}

        <Secao titulo={`Moradores (${usuarios.length})`}>
          <Mensagem texto="Aparecem só os moradores do seu condomínio. Cada um assiste apenas os postes e as câmeras que você liberar." />
          {usuarios.length > 8 && <Campo rotulo="Buscar" placeholder="Nome ou email" autoCorrect={false} autoCapitalize="none" value={busca} onChangeText={setBusca} />}
          {usuarios.filter(u => !busca.trim() || `${u.nome} ${u.email}`.toLowerCase().includes(busca.trim().toLowerCase())).map(u => (
            <Pressable
              key={u.id}
              onPress={() => router.push({ pathname: '/sindico/morador', params: { id: String(u.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`Abrir a ficha de ${u.nome}`}
              style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
            >
              <View style={styles.cartaoTexto}>
                <Text style={styles.nome} numberOfLines={1}>{u.nome}</Text>
                <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
              </View>
              {!u.ativo && <Selo texto="Bloqueado" tom="erro" />}
            </Pressable>
          ))}
          {!carregando && usuarios.length === 0 && !erro && <Mensagem texto="Nenhum morador cadastrado ainda." />}
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
  criar: {
    ...aceso(c), borderRadius: raio.grande, minHeight: componentes.botao.altura + espaco[5],
    flexDirection: 'row', alignItems: 'center', gap: espaco[3.5], paddingHorizontal: espaco[5], paddingVertical: espaco[3.5],
  },
  criarTexto: { flex: 1, gap: espaco[0.5] },
  criarTitulo: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.sobreLuz },
  criarApoio: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.sobreLuz, opacity: 0.85 },
  formulario: { gap: espaco[4] },
  formularioTitulo: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, lineHeight: entrelinha.titulo, color: c.texto },
  acoes: { flexDirection: 'row', gap: espaco[3] },
  acao: { flex: 1 },
  cartaoTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  email: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
});
