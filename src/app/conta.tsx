import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { BarraCarregando } from '@/components/efeitos';
import { Botao, Campo, confirmar, LinhaInfo, Mensagem, Opcoes, Secao } from '@/components/formulario';
import { Toque } from '@/components/efeitos';
import { Avatar, Cabecalho, Cartao } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { apagarFoto, escolherFoto, salvarFoto } from '@/lib/foto';
import {
  buscarPerfil, dataParaIso, formatarDataDigitada, formatarTelefone, idadeDe, isoParaData, salvarPerfil, type Perfil,
} from '@/lib/perfil';
import { componentes, corpo, entrelinha, espaco, fontes, temas, type Modo, type Paleta } from '@/lib/tema';

/**
 * Minha conta: quem está logado, os dados pessoais (nome, como quer ser chamado, telefone,
 * nascimento e unidade), a aparência do app, a troca de senha e o sair.
 */
export default function ContaScreen() {
  const { usuario, logout, atualizarSessao, foto, definirFoto } = useAuth();
  const { modo, definir } = useTema();
  const styles = useEstilos(criarEstilos);

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [noServidor, setNoServidor] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);

  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [apelido, setApelido] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nascimento, setNascimento] = useState('');   // DD/MM/AAAA, como a pessoa digita
  const [unidade, setUnidade] = useState('');
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [erroDados, setErroDados] = useState<string | null>(null);
  const [avisoDados, setAvisoDados] = useState<string | null>(null);
  const [mexendoNaFoto, setMexendoNaFoto] = useState(false);
  const [avisoFoto, setAvisoFoto] = useState<{ texto: string; erro: boolean } | null>(null);

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [avisoSenha, setAvisoSenha] = useState<string | null>(null);

  const preencher = (p: Perfil) => {
    setPerfil(p);
    setNome(p.nome);
    setApelido(p.apelido);
    setTelefone(formatarTelefone(p.telefone));
    setNascimento(isoParaData(p.dataNascimento));
    setUnidade(p.unidade);
  };

  useEffect(() => {
    let cancelado = false;
    buscarPerfil()
      .then(r => { if (!cancelado) { preencher(r.perfil); setNoServidor(r.noServidor); } })
      .catch(e => { if (!cancelado) setErroDeCarga(e instanceof ApiError ? e.message : 'Não foi possível carregar os seus dados.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, []);

  // ── foto ──
  async function trocarFoto() {
    if (!perfil || mexendoNaFoto) return;
    setAvisoFoto(null);
    setMexendoNaFoto(true);
    try {
      const escolhida = await escolherFoto();
      if (!escolhida) return;                      // a pessoa fechou a galeria
      const { imagem, onde } = await salvarFoto(perfil.id, escolhida);
      definirFoto(imagem);
      setAvisoFoto({ texto: onde === 'servidor' ? 'Foto trocada.' : 'Foto trocada. Por enquanto ela fica salva só neste aparelho.', erro: false });
    } catch (e) {
      setAvisoFoto({ texto: e instanceof ApiError ? e.message : 'Não foi possível trocar a foto. Tente de novo.', erro: true });
    } finally {
      setMexendoNaFoto(false);
    }
  }

  async function removerFoto() {
    if (!perfil || mexendoNaFoto) return;
    if (!(await confirmar('Remover a foto?', 'Voltam a aparecer as iniciais do seu nome.', 'Remover'))) return;
    setAvisoFoto(null);
    setMexendoNaFoto(true);
    try {
      await apagarFoto(perfil.id);
      definirFoto(null);
      setAvisoFoto({ texto: 'Foto removida.', erro: false });
    } catch (e) {
      setAvisoFoto({ texto: e instanceof ApiError ? e.message : 'Não foi possível remover a foto. Tente de novo.', erro: true });
    } finally {
      setMexendoNaFoto(false);
    }
  }

  // ── dados pessoais ──
  const nascimentoIso = dataParaIso(nascimento);            // '' = em branco; null = inválida
  const digitosDoTelefone = telefone.replace(/\D/g, '');
  const telefoneRuim = digitosDoTelefone.length > 0 && digitosDoTelefone.length < 10;
  const idade = nascimentoIso ? idadeDe(nascimentoIso) : null;
  const mudou = !!perfil && (
    nome.trim() !== perfil.nome || apelido.trim() !== perfil.apelido || digitosDoTelefone !== perfil.telefone
    || (nascimentoIso ?? 'x') !== perfil.dataNascimento || unidade.trim() !== perfil.unidade
  );
  const podeSalvarDados = mudou && nome.trim().length >= 2 && !telefoneRuim && nascimentoIso !== null;

  async function salvarDados() {
    if (!perfil || !podeSalvarDados || nascimentoIso === null) return;
    setSalvandoDados(true);
    setErroDados(null);
    setAvisoDados(null);
    try {
      const r = await salvarPerfil(perfil, { nome, apelido, telefone: digitosDoTelefone, dataNascimento: nascimentoIso, unidade });
      preencher(r.perfil);
      await atualizarSessao({ nome: r.perfil.nome, apelido: r.perfil.apelido });
      setAvisoDados(
        r.onde === 'servidor' ? 'Dados salvos.'
          : r.nomeNaoMudou ? 'Salvo só neste aparelho, e o nome não pôde ser trocado: o servidor ainda não permite. Peça a um administrador para corrigir o nome.'
            : 'Salvo só neste aparelho. Quando o servidor for atualizado, os dados passam a valer em qualquer aparelho.',
      );
    } catch (e) {
      setErroDados(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvandoDados(false);
    }
  }

  // ── senha ──
  const diferente = nova !== '' && repetida !== '' && nova !== repetida;
  const podeTrocar = atual !== '' && nova.length >= 6 && nova === repetida && nova !== atual;

  async function trocarSenha() {
    if (!podeTrocar) return;
    setSalvandoSenha(true);
    setErroSenha(null);
    setAvisoSenha(null);
    try {
      await api('/auth/trocar-senha', { method: 'POST', body: { senha_atual: atual, senha_nova: nova } });
      setAtual(''); setNova(''); setRepetida('');
      setAvisoSenha('Senha trocada. Use a nova na próxima vez que entrar.');
    } catch (e) {
      setErroSenha(e instanceof ApiError ? e.message : 'Não foi possível trocar a senha. Tente de novo.');
    } finally {
      setSalvandoSenha(false);
    }
  }

  async function sair() {
    if (await confirmar('Sair da conta?', 'Você vai precisar do email e da senha para entrar de novo.', 'Sair')) {
      await logout();
    }
  }

  const papel = perfil?.role ?? usuario?.role;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={'Minha conta'} />
      <BarraCarregando ativa={carregando} />
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {/* quem é */}
        <Cartao style={styles.cartaoDeQuem}>
          <Toque onPress={() => { void trocarFoto(); }} disabled={!perfil || mexendoNaFoto} accessibilityRole="button" accessibilityLabel="Trocar a foto do perfil">
            <Avatar tamanho={componentes.avatarGrande} />
          </Toque>
          <View style={styles.quemTexto}>
            <Text style={styles.nome} numberOfLines={2}>{perfil?.nome ?? usuario?.nome ?? ''}</Text>
            {perfil && <Text style={styles.apoio} numberOfLines={1}>{perfil.email}</Text>}
            {papel && <Text style={styles.papel}>{NOME_DO_PAPEL[papel] ?? papel}</Text>}
          </View>
        </Cartao>

        {perfil && (
          <View style={styles.acoesDaFoto}>
            <View style={styles.acaoDaFoto}>
              <Botao titulo={foto ? 'Trocar foto' : 'Escolher foto'} variante="secundario" onPress={() => { void trocarFoto(); }} carregando={mexendoNaFoto} />
            </View>
            {foto && (
              <View style={styles.acaoDaFoto}>
                <Botao titulo="Remover foto" variante="perigo" onPress={() => { void removerFoto(); }} desabilitado={mexendoNaFoto} />
              </View>
            )}
          </View>
        )}
        {avisoFoto && <Mensagem texto={avisoFoto.texto} tom={avisoFoto.erro ? 'erro' : 'azul'} />}

        {erroDeCarga && <Mensagem texto={erroDeCarga} tom="erro" />}

        {perfil && (
          <Secao titulo="Seus dados">
            {!noServidor && (
              <Mensagem texto="O servidor ainda não guarda estes dados. Por enquanto o que você preencher fica salvo só neste aparelho." />
            )}
            <Campo rotulo="Nome completo" value={nome} onChangeText={setNome} autoCapitalize="words" autoComplete="name" />
            <Campo
              rotulo="Como quer ser chamado"
              value={apelido}
              onChangeText={setApelido}
              autoCapitalize="words"
              maxLength={60}
              placeholder={perfil.nome.split(' ')[0]}
              ajuda="Aparece na saudação da tela inicial."
            />
            <Campo
              rotulo="Telefone (WhatsApp)"
              value={telefone}
              onChangeText={t => setTelefone(formatarTelefone(t))}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="(11) 90000-0000"
              ajuda={telefoneRuim ? undefined : 'Para a CM Port falar com você sobre as câmeras.'}
            />
            {telefoneRuim && <Mensagem texto="Informe o telefone com DDD." tom="erro" />}
            <Campo
              rotulo="Data de nascimento"
              value={nascimento}
              onChangeText={t => setNascimento(formatarDataDigitada(t))}
              keyboardType="number-pad"
              placeholder="DD/MM/AAAA"
              maxLength={10}
              ajuda={idade !== null ? `${idade} ${idade === 1 ? 'ano' : 'anos'}.` : undefined}
            />
            {nascimentoIso === null && nascimento.length === 10 && <Mensagem texto="Essa data não existe ou ainda não chegou." tom="erro" />}
            {perfil.role === 'MORADOR' && (
              <Campo rotulo="Bloco e apartamento" value={unidade} onChangeText={setUnidade} maxLength={60} placeholder="Bloco B, apto 42" />
            )}
            {erroDados && <Mensagem texto={erroDados} tom="erro" />}
            {avisoDados && <Mensagem texto={avisoDados} tom="azul" />}
            <Botao titulo="Salvar dados" onPress={() => { void salvarDados(); }} carregando={salvandoDados} desabilitado={!podeSalvarDados} />
          </Secao>
        )}

        <Secao titulo="Aparência">
          <Opcoes<Modo>
            rotulo="Tema do aplicativo"
            valor={modo}
            opcoes={temas.map(t => ({ valor: t.valor, rotulo: t.rotulo }))}
            onChange={definir}
          />
        </Secao>

        <Secao titulo="Trocar a senha">
          <Campo rotulo="Senha atual" value={atual} onChangeText={setAtual} secureTextEntry autoComplete="current-password" />
          <Campo rotulo="Senha nova" value={nova} onChangeText={setNova} secureTextEntry autoComplete="new-password" ajuda="Pelo menos 6 caracteres, diferente da atual." />
          <Campo rotulo="Repita a senha nova" value={repetida} onChangeText={setRepetida} secureTextEntry autoComplete="new-password" />
          {diferente && <Mensagem texto="As duas senhas novas não são iguais." tom="erro" />}
          {erroSenha && <Mensagem texto={erroSenha} tom="erro" />}
          {avisoSenha && <Mensagem texto={avisoSenha} tom="azul" />}
          <Botao titulo="Trocar senha" variante="secundario" onPress={() => { void trocarSenha(); }} carregando={salvandoSenha} desabilitado={!podeTrocar} />
        </Secao>

        <Secao titulo="Sobre">
          <View>
            {papel && <LinhaInfo rotulo="Nível de acesso" valor={NOME_DO_PAPEL[papel] ?? papel} />}
            <LinhaInfo rotulo="Versão do aplicativo" valor={Constants.expoConfig?.version ?? '–'} />
          </View>
        </Secao>

        <Botao titulo="Sair da conta" variante="perigo" onPress={() => { void sair(); }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[6] },
  cartaoDeQuem: { flexDirection: 'row', alignItems: 'center', gap: espaco[4] },
  acoesDaFoto: { flexDirection: 'row', gap: espaco[3], marginTop: -espaco[3] },
  acaoDaFoto: { flex: 1 },
  quemTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, lineHeight: entrelinha.titulo, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
  papel: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.azul, marginTop: espaco[0.5] },
});
