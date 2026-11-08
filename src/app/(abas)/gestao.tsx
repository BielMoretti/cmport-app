import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Fundo, GlifoAlerta, GlifoCameraAba, GlifoMais, GlifoPessoas, GlifoPredio, GlifoSinal } from '@/components/arte';
import { Entrada, Toque } from '@/components/efeitos';
import ConvidarMorador from '@/components/ConvidarMorador';
import { Botao, Campo, Mensagem, Opcoes, Selo } from '@/components/formulario';
import SeletorDeAcessos, { camerasAlcancadas, type Acessos } from '@/components/SeletorDeAcessos';
import { Bloco, Cartao, Esqueleto, Numero, Progresso, Saudacao } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { cpfValido, formatarCpf } from '@/lib/perfil';
import { estadoDe } from '@/lib/saude';
import { aceso, componentes, corpo, entrelinha, espaco, fontes, palco, raio, vidro, type Paleta } from '@/lib/tema';
import { nomeDoMes, reais } from '@/lib/texto';
import { localDoUsuario, type Camera, type CobrancaResumo, type Poste, type Usuario } from '@/lib/types';
import { tr } from '@/lib/idioma';

/** Um local (condomínio) do síndico. O serviço de cliente manda só id e nome. */
interface Local { id: number; nome: string }

const SEM_ACESSOS: Acessos = { postes: new Set(), cameras: new Set() };

/** Edição em lote: quantos moradores são gravados ao mesmo tempo (pouco, para não afogar o servidor). */
const LOTE_SIMULTANEOS = 2;

type AcaoDoLote = 'liberar' | 'tirar';
interface ListaDeAcessos { poste_ids: number[]; camera_ids: number[] }
interface ResultadoDoLote { acao: AcaoDoLote; certos: number; total: number; falhas: { id: number; nome: string; mensagem: string }[] }

/**
 * O que o morador passa a ver depois do lote: MESCLA com o que ele já vê, nunca substitui.
 * - liberar: soma os postes e as câmeras; câmera de um poste que ele vê inteiro fica sobrando e sai;
 * - tirar: tira os postes e as câmeras (as de um poste tirado também). Se a câmera tirada é de um
 *   poste que ele vê inteiro, o poste vira as outras câmeras dele, uma a uma.
 * `cameras` é a lista do síndico, para saber de que poste é cada câmera.
 */
function mesclarAcessos(atual: ListaDeAcessos, escolha: Acessos, acao: AcaoDoLote, cameras: Camera[]): ListaDeAcessos {
  const posteDe = (id: number) => cameras.find(c => c.id === id)?.poste_id ?? null;
  if (acao === 'liberar') {
    const postes = new Set([...atual.poste_ids, ...escolha.postes]);
    const avulsas = [...new Set([...atual.camera_ids, ...escolha.cameras])].filter(id => { const p = posteDe(id); return p === null || !postes.has(p); });
    return { poste_ids: [...postes], camera_ids: avulsas };
  }
  const tiradas = new Set([...escolha.cameras, ...cameras.filter(c => c.poste_id !== null && escolha.postes.has(c.poste_id)).map(c => c.id)]);
  const postes = new Set(atual.poste_ids.filter(id => !escolha.postes.has(id)));
  const avulsas = new Set(atual.camera_ids);
  for (const p of [...postes]) {
    const doPoste = cameras.filter(c => c.poste_id === p);
    if (!doPoste.some(c => tiradas.has(c.id))) continue;
    postes.delete(p);
    for (const c of doPoste) avulsas.add(c.id);
  }
  return { poste_ids: [...postes], camera_ids: [...avulsas].filter(id => !tiradas.has(id)) };
}

const mesmaLista = (a: number[], b: number[]) => a.length === b.length && a.every(id => b.includes(id));
const valoresDoResultado = (r: ResultadoDoLote) => [r.certos, r.total, r.total === 1 ? tr('morador') : tr('moradores')];

/**
 * Gestão — a aba do síndico. Em cima, os números dos moradores e dos condomínios dele; depois,
 * criar morador (escolhendo o condomínio e os postes e câmeras que ele vai ver) e a lista de
 * moradores, que abre a ficha de cada um.
 *
 * O síndico pode cuidar de mais de um condomínio: tudo aqui é separado por condomínio.
 *
 * Cobrança: a CM Port decide, por condomínio, se cada morador cadastrado custa um valor fixo.
 * Onde custa, o síndico é avisado no formulário e confirma numa janela antes de criar; o
 * quadro "Cobrança" mostra o que já foi registrado no mês. Quem registra é o servidor.
 * As rotas de moradores (/usuarios) são a próxima etapa do serviço; enquanto não existirem,
 * a tela mostra os números que já dá para mostrar e um aviso.
 */
export default function GestaoScreen() {
  const router = useRouter();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);

  const [locais, setLocais] = useState<Local[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [moradores, setMoradores] = useState<Usuario[]>([]);
  const [cobrancas, setCobrancas] = useState<CobrancaResumo[]>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // criar morador
  const [criandoAberto, setCriandoAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [cpf, setCpf] = useState('');
  const [unidade, setUnidade] = useState('');
  const [localId, setLocalId] = useState<number | null>(null);
  const [acessos, setAcessos] = useState<Acessos>(SEM_ACESSOS);
  const [criando, setCriando] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);   // a janela do aviso de cobrança

  // lista
  const [busca, setBusca] = useState('');
  const [filtroLocal, setFiltroLocal] = useState<number | null>(null);

  // edição em lote: marcar vários moradores e liberar ou tirar câmeras de todos de uma vez
  const [selecionando, setSelecionando] = useState(false);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [lote, setLote] = useState<AcaoDoLote | null>(null);
  const [acessosDoLote, setAcessosDoLote] = useState<Acessos>(SEM_ACESSOS);
  const [progressoDoLote, setProgressoDoLote] = useState<{ feitos: number; total: number } | null>(null);
  const [resultadoDoLote, setResultadoDoLote] = useState<ResultadoDoLote | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [listaLocais, listaPostes, listaCameras] = await Promise.all([
        api<Local[]>('/condominios'),
        api<Poste[]>('/postes'),
        api<Camera[]>('/cameras'),
      ]);
      setLocais(listaLocais);
      setPostes(listaPostes);
      setCameras(listaCameras);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível carregar a gestão. Puxe a tela para tentar de novo.'));
      return;
    }
    try {
      setMoradores((await api<Usuario[]>('/usuarios')).filter(u => u.role === 'MORADOR'));
      setIndisponivel(false);
    } catch (e) {
      // 404/405 = o servidor ainda não tem a gestão de moradores
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) setIndisponivel(true);
      else setErro(e instanceof ApiError ? e.message : tr('Não foi possível carregar os moradores.'));
    }
    try {
      setCobrancas(await api<CobrancaResumo[]>('/cobrancas'));
    } catch {
      // servidor sem a cobrança ainda (ou fora do ar): a tela segue; se o condomínio cobrar,
      // é o servidor que recusa o cadastro e a mensagem dele aparece no formulário
      setCobrancas([]);
    }
  }, []);

  // recarrega ao voltar da ficha de um morador
  useFocusEffect(useCallback(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]));

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  // com um condomínio só, ele já vem escolhido
  const localEscolhido = localId ?? (locais.length === 1 ? locais[0].id : null);
  const variosLocais = locais.length > 1;
  const nomeDoLocal = useCallback((id: number | null | undefined) => locais.find(l => l.id === id)?.nome ?? null, [locais]);

  // ── os números ──
  const ativos = moradores.filter(m => m.ativo).length;
  const bloqueados = moradores.length - ativos;
  // só dá para saber quem nunca entrou se o servidor disser em qual aparelho a conta está
  const sabeAparelho = moradores.some(m => m.aparelho_nome !== undefined);
  const nuncaEntraram = moradores.filter(m => m.ativo && m.aparelho_nome === null).length;
  const online = cameras.filter(c => estadoDe(c) === 'online').length;

  const porLocal = useMemo(() => locais.map(l => {
    const doLocal = cameras.filter(c => c.condominio_id === l.id);
    return {
      local: l,
      moradores: moradores.filter(m => localDoUsuario(m)?.id === l.id).length,
      postes: postes.filter(p => p.condominio_id === l.id).length,
      cameras: doLocal.length,
      online: doLocal.filter(c => estadoDe(c) === 'online').length,
    };
  }), [locais, cameras, postes, moradores]);
  const sabeLocalDoMorador = moradores.some(m => localDoUsuario(m) !== null);

  // ── criar ──
  const postesDoLocal = useMemo(() => postes.filter(p => p.condominio_id === localEscolhido), [postes, localEscolhido]);
  const camerasDoLocal = useMemo(() => cameras.filter(c => c.condominio_id === localEscolhido), [cameras, localEscolhido]);
  const totalLiberado = camerasAlcancadas(camerasDoLocal, acessos);
  const cobrancaDoLocal = cobrancas.find(c => c.condominio_id === localEscolhido && c.cobra) ?? null;
  // só entra no quadro o condomínio que cobra ou que já teve algo cobrado
  const comCobranca = cobrancas.filter(c => c.cobra || c.quantidade_total > 0);
  const podeCriar = nome.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim()) && senha.length >= 6 && cpfValido(cpf) && unidade.trim().length > 0 && localEscolhido !== null;

  function fechar() {
    setCriandoAberto(false);
    setConfirmando(false);
    setErroNovo(null);
    setNome(''); setEmail(''); setSenha(''); setCpf(''); setUnidade('');
    setLocalId(null);
    setAcessos(SEM_ACESSOS);
  }

  /** `concordou` = o síndico tocou em "Concordo e criar" na janela do aviso. */
  async function criar(concordou = false) {
    if (!podeCriar || localEscolhido === null) return;
    // condomínio que cobra: primeiro o aviso, e só cria depois de ele concordar
    if (cobrancaDoLocal && !concordou) { setConfirmando(true); return; }
    setConfirmando(false);
    setCriando(true);
    setErroNovo(null);
    setAviso(null);
    let novo: Usuario;
    try {
      novo = await api<Usuario>('/usuarios', {
        method: 'POST',
        body: {
          nome: nome.trim(), email: email.trim().toLowerCase(), cpf: cpf.replace(/\D/g, ''), senha, role: 'MORADOR',
          condominio_id: localEscolhido, unidade: unidade.trim(),
          // o que ele vê vai no mesmo pedido da criação
          poste_ids: [...acessos.postes], camera_ids: [...acessos.cameras],
          ...(concordou ? { aceito_cobranca: true } : {}),
        },
      });
    } catch (e) {
      // quando o servidor recusa os dados, a mensagem já diz qual campo e por quê (lib/api.ts)
      setErroNovo(e instanceof ApiError ? e.message : tr('Não foi possível criar o morador. Tente de novo.'));
      setCriando(false);
      return;
    }
    // o login já existe. Confere se o servidor gravou o que foi marcado; se a versão dele ainda não
    // aceita os acessos junto com a criação, grava em seguida. Se falhar, a ficha abre para tentar de novo.
    try {
      if (acessos.postes.size + acessos.cameras.size > 0) {
        const gravado = await api<{ poste_ids: number[]; camera_ids: number[] }>(`/usuarios/${novo.id}/acessos`);
        const igual = gravado.poste_ids.length === acessos.postes.size && gravado.camera_ids.length === acessos.cameras.size
          && gravado.poste_ids.every(id => acessos.postes.has(id)) && gravado.camera_ids.every(id => acessos.cameras.has(id));
        if (!igual) await api(`/usuarios/${novo.id}/acessos`, { method: 'PUT', body: { poste_ids: [...acessos.postes], camera_ids: [...acessos.cameras] } });
      }
      setAviso(totalLiberado === 0
        ? tr('{0} foi criado, mas ainda não vê nenhuma câmera. Abra a ficha dele para liberar.', [novo.nome])
        : tr('{0} foi criado e vê {1} {2}.', [novo.nome, totalLiberado, totalLiberado === 1 ? tr('câmera') : tr('câmeras')]));
      fechar();
      await carregar();
    } catch {
      fechar();
      router.push({ pathname: '/sindico/morador', params: { id: String(novo.id) } });
    } finally {
      setCriando(false);
    }
  }

  // ── lista ──
  const termo = busca.trim().toLowerCase();
  const visiveis = moradores
    .filter(m => filtroLocal === null || localDoUsuario(m)?.id === filtroLocal)
    .filter(m => !termo || `${m.nome} ${m.email}`.toLowerCase().includes(termo));

  // ── lote ──
  const doLote = moradores.filter(m => marcados.has(m.id));
  const aplicandoLote = progressoDoLote !== null;
  // o seletor mostra só os condomínios dos moradores marcados (morador sem condomínio conhecido: todos)
  const locaisDoLote = doLote.some(m => !localDoUsuario(m)) ? null : new Set(doLote.map(m => localDoUsuario(m)!.id));
  const postesDoLote = locaisDoLote ? postes.filter(p => locaisDoLote.has(p.condominio_id)) : postes;
  const camerasDoLote = locaisDoLote ? cameras.filter(c => locaisDoLote.has(c.condominio_id)) : cameras;
  const algoNoLote = acessosDoLote.postes.size + acessosDoLote.cameras.size > 0;

  function alternarMarcado(id: number) {
    setMarcados(atual => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  function sairDaSelecao() {
    setSelecionando(false);
    setMarcados(new Set());
    setLote(null);
    setAcessosDoLote(SEM_ACESSOS);
    setResultadoDoLote(null);
  }

  /** Um morador do lote: lê o que ele vê, mescla com a escolha (só o do condomínio dele) e grava. */
  async function aplicarEm(m: Usuario, acao: AcaoDoLote) {
    const local = localDoUsuario(m)?.id ?? null;
    const escolha: Acessos = local === null ? acessosDoLote : {
      postes: new Set([...acessosDoLote.postes].filter(id => postes.find(p => p.id === id)?.condominio_id === local)),
      cameras: new Set([...acessosDoLote.cameras].filter(id => cameras.find(c => c.id === id)?.condominio_id === local)),
    };
    if (escolha.postes.size + escolha.cameras.size === 0) return;      // nada do condomínio dele foi marcado
    const atual = await api<ListaDeAcessos>(`/usuarios/${m.id}/acessos`);
    const novo = mesclarAcessos(atual, escolha, acao, cameras);
    if (mesmaLista(novo.poste_ids, atual.poste_ids) && mesmaLista(novo.camera_ids, atual.camera_ids)) return;
    await api(`/usuarios/${m.id}/acessos`, { method: 'PUT', body: novo });
  }

  async function aplicarLote() {
    if (!lote || !algoNoLote || doLote.length === 0) return;
    const acao = lote;
    const fila = [...doLote];
    const total = fila.length;
    const falhas: ResultadoDoLote['falhas'] = [];
    let feitos = 0;
    setResultadoDoLote(null);
    setAviso(null);
    setProgressoDoLote({ feitos, total });
    // poucos de cada vez; quem falha não desfaz quem já deu certo
    const trabalhar = async () => {
      for (let m = fila.shift(); m; m = fila.shift()) {
        try {
          await aplicarEm(m, acao);
        } catch (e) {
          falhas.push({ id: m.id, nome: m.nome, mensagem: e instanceof ApiError ? e.message : tr('Não foi possível falar com o servidor.') });
        }
        feitos += 1;
        setProgressoDoLote({ feitos, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(LOTE_SIMULTANEOS, total) }, trabalhar));
    setProgressoDoLote(null);
    setResultadoDoLote({ acao, certos: total - falhas.length, total, falhas });
    // quem deu certo sai da seleção; quem falhou continua marcado, para tentar de novo
    setMarcados(new Set(falhas.map(f => f.id)));
    if (falhas.length === 0) { setLote(null); setAcessosDoLote(SEM_ACESSOS); }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Fundo />
      <ScrollView
        contentContainerStyle={styles.conteudo}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        <Saudacao titulo={tr('Gestão')} />

        <View style={styles.corpo}>
          {erro && <Mensagem texto={erro} tom="erro" />}
          {aviso && <Mensagem texto={aviso} tom="azul" />}

          {carregando ? (
            <>
              <Esqueleto altura={componentes.cartao.alturaMin} />
              <Esqueleto altura={componentes.botao.altura + espaco[5]} />
              <Esqueleto altura={componentes.cartao.alturaMin} />
            </>
          ) : (
            <>
              {/* 1. Os números */}
              <Entrada ordem={0}>
                <Bloco titulo={tr('Moradores')}>
                  {indisponivel ? (
                    <Mensagem texto={tr('Cadastrar moradores e liberar câmeras pelo aplicativo é a próxima etapa do serviço. Por enquanto, quem cadastra os moradores e libera os acessos é a CM Port: fale com a equipe.')} />
                  ) : (
                    <View style={styles.numeros}>
                      <Numero icone={<GlifoPessoas cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={moradores.length} legenda={moradores.length === 1 ? tr('morador') : tr('moradores')} />
                      <Numero icone={<GlifoSinal cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={ativos} legenda={ativos === 1 ? tr('ativo') : tr('ativos')} />
                      <Numero icone={<GlifoAlerta cor={bloqueados > 0 ? cores.erro : cores.textoSuave} tamanho={componentes.iconeCaixa.glifo} />} valor={bloqueados} legenda={bloqueados === 1 ? tr('bloqueado') : tr('bloqueados')} tom="erro" />
                      {sabeAparelho && (
                        <Numero icone={<GlifoPessoas cor={cores.textoSuave} tamanho={componentes.iconeCaixa.glifo} />} valor={nuncaEntraram} legenda={tr('sem entrar')} />
                      )}
                    </View>
                  )}
                </Bloco>
              </Entrada>

              <Entrada ordem={1}>
                <Bloco titulo={variosLocais ? tr('Seus condomínios') : tr('Seu condomínio')}>
                  <View style={styles.numeros}>
                    {variosLocais && <Numero icone={<GlifoPredio cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={locais.length} legenda={tr('locais')} />}
                    <Numero icone={<GlifoCameraAba cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={cameras.length} legenda={cameras.length === 1 ? tr('câmera') : tr('câmeras')} />
                    <Numero icone={<GlifoSinal cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />} valor={online} legenda={tr('no ar')} />
                    <Numero icone={<GlifoAlerta cor={cameras.length - online > 0 ? cores.erro : cores.textoSuave} tamanho={componentes.iconeCaixa.glifo} />} valor={cameras.length - online} legenda={tr('fora do ar')} tom="erro" />
                  </View>
                  {variosLocais && porLocal.map(p => (
                    <View key={p.local.id} style={styles.linhaLocal}>
                      <Text style={styles.nome} numberOfLines={1}>{p.local.nome}</Text>
                      <Text style={styles.apoio}>
                        {[
                          !indisponivel && sabeLocalDoMorador ? `${p.moradores} ${p.moradores === 1 ? tr('morador') : tr('moradores')}` : null,
                          tr('{0} {1}, {2} no ar', [p.cameras, p.cameras === 1 ? tr('câmera') : tr('câmeras'), p.online]),
                          p.postes > 0 ? `${p.postes} ${p.postes === 1 ? tr('poste') : tr('postes')}` : null,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  ))}
                </Bloco>
              </Entrada>

              {/* 2. Criar morador */}
              {!indisponivel && (!criandoAberto ? (
                <Toque onPress={() => { setCriandoAberto(true); setAviso(null); }} brilho accessibilityRole="button" accessibilityLabel={tr('Criar morador')} style={styles.criar}>
                  <GlifoMais cor={cores.sobreLuz} tamanho={componentes.iconeCaixa.glifo} />
                  <View style={styles.criarTexto}>
                    <Text style={styles.criarTitulo}>{tr('Criar morador')}</Text>
                    <Text style={styles.criarApoio}>{tr('Crie o login e escolha o condomínio e as câmeras')}</Text>
                  </View>
                </Toque>
              ) : (
                <Cartao destaque style={styles.formulario}>
                  <Text style={styles.formularioTitulo} accessibilityRole="header">{tr('Novo morador')}</Text>
                  <Campo rotulo={tr('Nome')} value={nome} onChangeText={setNome} autoFocus />
                  <Campo rotulo={tr('Email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
                  <Campo
                    rotulo={tr('CPF')} value={formatarCpf(cpf)} onChangeText={t => setCpf(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad"
                    ajuda={cpf.length === 11 && !cpfValido(cpf) ? tr('Este CPF não é válido. Confira os números.') : tr('Identifica o morador no cadastro da CM Port.')}
                  />
                  <Campo rotulo={tr('Unidade')} value={unidade} onChangeText={setUnidade} maxLength={50} placeholder={tr('Ex.: Bloco B, apto 42')} />
                  <Campo rotulo={tr('Senha inicial')} value={senha} onChangeText={setSenha} secureTextEntry ajuda={tr('Pelo menos 6 caracteres. Serve só para o primeiro acesso: ao entrar, o morador é obrigado a criar a própria senha.')} />

                  {variosLocais && (
                    <Opcoes<number | null>
                      rotulo={tr('Condomínio')}
                      valor={localEscolhido}
                      opcoes={locais.map(l => ({ valor: l.id, rotulo: l.nome }))}
                      onChange={novo => { setLocalId(novo); setAcessos(SEM_ACESSOS); }}
                    />
                  )}

                  {localEscolhido === null ? (
                    <Mensagem texto={tr('Escolha o condomínio para ver os postes e as câmeras que podem ser liberados.')} />
                  ) : camerasDoLocal.length === 0 ? (
                    <Mensagem texto={tr('Este condomínio ainda não tem câmera. O morador pode ser criado e receber as câmeras depois, pela ficha dele.')} />
                  ) : (
                    <View style={styles.acessos}>
                      <Text style={styles.rotulo}>{tr('O que este morador vai ver')}</Text>
                      <Text style={styles.apoio}>
                        {tr('Marque um poste para liberar todas as câmeras dele, ou marque as câmeras uma a uma.')}
                        {totalLiberado > 0 ? tr(' Marcado até agora: {0} {1}.', [totalLiberado, totalLiberado === 1 ? tr('câmera') : tr('câmeras')]) : ''}
                      </Text>
                      <SeletorDeAcessos postes={postesDoLocal} cameras={camerasDoLocal} valor={acessos} aoMudar={setAcessos} />
                    </View>
                  )}
                  {localEscolhido !== null && camerasDoLocal.length > 0 && totalLiberado === 0 && (
                    <Mensagem texto={tr('Sem nada marcado, o morador consegue entrar mas não vê nenhuma câmera.')} />
                  )}

                  {/* LGPD: o síndico informa o morador (Termos de uso, seção 6) */}
                  <Mensagem texto={tr('Ao criar, você confirma que o morador sabe que vai ter acesso pelo aplicativo. Nome, email, CPF e unidade ficam com a CM Port só para dar esse acesso, como explica a Política de privacidade. No primeiro acesso ele lê e aceita os Termos de uso.')} />
                  {cobrancaDoLocal && (
                    <Mensagem tom="azul" texto={tr('Cadastrar um morador neste condomínio custa {0}. Antes de criar, você confirma a cobrança.', [reais(cobrancaDoLocal.valor_por_usuario)])} />
                  )}
                  {erroNovo && <Mensagem texto={erroNovo} tom="erro" />}
                  <View style={styles.acoes}>
                    <View style={styles.acao}><Botao titulo={tr('Cancelar')} variante="secundario" onPress={fechar} desabilitado={criando} /></View>
                    <View style={styles.acao}><Botao titulo={tr('Criar morador')} onPress={() => { void criar(); }} carregando={criando} desabilitado={!podeCriar} /></View>
                  </View>
                </Cartao>
              ))}

              {/* 2b. Convidar por link: o morador preenche os próprios dados */}
              {!indisponivel && !criandoAberto && (
                <ConvidarMorador locais={locais} postes={postes} cameras={cameras} cobrancas={cobrancas} />
              )}

              {/* 3. Cobrança: só aparece para quem tem condomínio que cobra */}
              {!indisponivel && comCobranca.length > 0 && (
                <Bloco titulo={tr('Cobrança de {0}', [nomeDoMes(comCobranca[0].mes)])}>
                  <View style={styles.cobrancas}>
                    {comCobranca.map(c => (
                      <View key={c.condominio_id} style={styles.cobranca} accessibilityLabel={tr('{0}: {1} {2} neste mês, {3}', [nomeDoLocal(c.condominio_id) ?? c.nome ?? tr('Condomínio'), c.quantidade_mes, c.quantidade_mes === 1 ? tr('morador cadastrado') : tr('moradores cadastrados'), reais(c.total_mes)])}>
                        <View style={styles.cartaoTexto}>
                          <Text style={styles.nome} numberOfLines={1}>{variosLocais ? (nomeDoLocal(c.condominio_id) ?? c.nome ?? tr('Condomínio')) : tr('Moradores cadastrados')}</Text>
                          <Text style={styles.apoio}>
                            {c.quantidade_mes === 0
                              ? tr('Nenhum cadastro neste mês')
                              : `${c.quantidade_mes} ${c.quantidade_mes === 1 ? tr('cadastro') : tr('cadastros')} × ${reais(c.valor_por_usuario)}`}
                            {c.cobra ? '' : tr(' · cobrança desligada')}
                          </Text>
                        </View>
                        <Text style={styles.valor}>{reais(c.total_mes)}</Text>
                      </View>
                    ))}
                    {comCobranca.length > 1 && (
                      <View style={[styles.cobranca, styles.cobrancaTotal]}>
                        <Text style={[styles.nome, styles.cartaoTexto]}>{tr('Total do mês')}</Text>
                        <Text style={styles.valor}>{reais(comCobranca.reduce((soma, c) => soma + c.total_mes, 0))}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.apoio}>
                    {tr('É o que será cobrado no fechamento do mês, em boleto enviado à administradora do condomínio. A data do fechamento ainda vai ser informada pela CM Port.')}
                  </Text>
                </Bloco>
              )}

              {/* 4. Quem já tem acesso */}
              {!indisponivel && (
                <Bloco
                  titulo={tr('Quem tem acesso ({0})', [moradores.length])}
                  acao={moradores.length === 0 || aplicandoLote ? undefined : selecionando ? tr('Concluir') : tr('Selecionar')}
                  aoTocar={() => { if (selecionando) sairDaSelecao(); else { setSelecionando(true); setAviso(null); } }}
                >
                  {variosLocais && sabeLocalDoMorador && moradores.length > 0 && (
                    <Opcoes<number | null>
                      rotulo={tr('Mostrar')}
                      valor={filtroLocal}
                      opcoes={[{ valor: null, rotulo: tr('Todos') }, ...locais.map(l => ({ valor: l.id as number | null, rotulo: l.nome }))]}
                      onChange={setFiltroLocal}
                    />
                  )}
                  {moradores.length > 8 && <Campo rotulo={tr('Buscar')} placeholder={tr('Nome ou email')} autoCorrect={false} autoCapitalize="none" value={busca} onChangeText={setBusca} />}

                  {/* edição em lote: a contagem, marcar todos e as ações sobre os marcados */}
                  {selecionando && (
                    <View style={styles.lote}>
                      <View style={styles.loteCabeca}>
                        <Text style={styles.apoio}>
                          {marcados.size === 0 ? tr('Toque nos moradores para marcar.') : marcados.size === 1 ? tr('{0} selecionado', [1]) : tr('{0} selecionados', [marcados.size])}
                        </Text>
                        {!aplicandoLote && visiveis.length > 0 && (
                          <Pressable
                            onPress={() => setMarcados(visiveis.every(m => marcados.has(m.id)) ? new Set() : new Set(visiveis.map(m => m.id)))}
                            hitSlop={espaco[3]}
                            accessibilityRole="button"
                          >
                            <Text style={styles.loteLink}>
                              {visiveis.every(m => marcados.has(m.id)) ? tr('Desmarcar todos') : tr('Marcar os {0} mostrados', [visiveis.length])}
                            </Text>
                          </Pressable>
                        )}
                      </View>

                      {marcados.size > 0 && !lote && (
                        <View style={styles.acoes}>
                          <View style={styles.acao}><Botao titulo={tr('Liberar câmeras')} onPress={() => { setLote('liberar'); setAcessosDoLote(SEM_ACESSOS); setResultadoDoLote(null); }} /></View>
                          <View style={styles.acao}><Botao titulo={tr('Tirar câmeras')} variante="secundario" onPress={() => { setLote('tirar'); setAcessosDoLote(SEM_ACESSOS); setResultadoDoLote(null); }} /></View>
                        </View>
                      )}

                      {lote && marcados.size > 0 && (
                        <Cartao destaque style={styles.formulario}>
                          <Text style={styles.formularioTitulo} accessibilityRole="header">
                            {lote === 'liberar'
                              ? tr('Liberar câmeras para {0} {1}', [marcados.size, marcados.size === 1 ? tr('morador') : tr('moradores')])
                              : tr('Tirar câmeras de {0} {1}', [marcados.size, marcados.size === 1 ? tr('morador') : tr('moradores')])}
                          </Text>
                          <Text style={styles.apoio}>
                            {lote === 'liberar'
                              ? tr('O que você marcar é somado ao que cada um já vê; nada é tirado. Cada morador só recebe as câmeras do condomínio dele.')
                              : tr('O que você marcar é tirado de cada um; o resto continua liberado. Se a câmera tirada é de um poste que o morador vê inteiro, ele continua vendo as outras câmeras desse poste.')}
                          </Text>
                          <SeletorDeAcessos postes={postesDoLote} cameras={camerasDoLote} valor={acessosDoLote} aoMudar={setAcessosDoLote} />
                          {progressoDoLote && (
                            <View style={styles.acessos}>
                              <Progresso fracao={progressoDoLote.feitos / progressoDoLote.total} rotulo={tr('Aplicando: {0} de {1}', [progressoDoLote.feitos, progressoDoLote.total])} />
                              <Text style={styles.apoio}>{tr('Aplicando: {0} de {1}', [progressoDoLote.feitos, progressoDoLote.total])}</Text>
                            </View>
                          )}
                          {!algoNoLote && <Mensagem texto={tr('Marque ao menos um poste ou uma câmera.')} />}
                          <View style={styles.acoes}>
                            <View style={styles.acao}><Botao titulo={tr('Cancelar')} variante="secundario" onPress={() => { setLote(null); setAcessosDoLote(SEM_ACESSOS); }} desabilitado={aplicandoLote} /></View>
                            <View style={styles.acao}><Botao titulo={lote === 'liberar' ? tr('Liberar câmeras') : tr('Tirar câmeras')} onPress={() => { void aplicarLote(); }} carregando={aplicandoLote} desabilitado={!algoNoLote} /></View>
                          </View>
                        </Cartao>
                      )}

                      {/* o resultado fica logo abaixo do botão que foi tocado */}
                      {resultadoDoLote && (
                        <Mensagem
                          tom="azul"
                          texto={resultadoDoLote.acao === 'liberar' ? tr('Pronto: câmeras liberadas para {0} de {1} {2}.', valoresDoResultado(resultadoDoLote)) : tr('Pronto: câmeras tiradas de {0} de {1} {2}.', valoresDoResultado(resultadoDoLote))}
                        />
                      )}
                      {resultadoDoLote && resultadoDoLote.falhas.length > 0 && (
                        <Mensagem
                          tom="erro"
                          texto={[
                            tr('Não deu certo para {0} {1}. Eles continuam marcados para tentar de novo:', [resultadoDoLote.falhas.length, resultadoDoLote.falhas.length === 1 ? tr('morador') : tr('moradores')]),
                            ...resultadoDoLote.falhas.map(f => `${f.nome}: ${f.mensagem}`),
                          ].join('\n')}
                        />
                      )}
                    </View>
                  )}

                  {visiveis.map(m => (
                    <Pressable
                      key={m.id}
                      onPress={() => selecionando
                        ? (!aplicandoLote && alternarMarcado(m.id))
                        : router.push({ pathname: '/sindico/morador', params: { id: String(m.id) } })}
                      accessibilityRole={selecionando ? 'checkbox' : 'button'}
                      accessibilityState={selecionando ? { checked: marcados.has(m.id), disabled: aplicandoLote } : undefined}
                      accessibilityLabel={selecionando ? tr('Marcar {0}', [m.nome]) : tr('Abrir a ficha de {0}', [m.nome])}
                      style={({ pressed }) => [styles.cartao, (pressed || (selecionando && marcados.has(m.id))) && styles.cartaoPressionado]}
                    >
                      {selecionando && (
                        <View style={[styles.caixa, marcados.has(m.id) && styles.caixaMarcada]}>
                          {marcados.has(m.id) && <View style={styles.caixaMiolo} />}
                        </View>
                      )}
                      <View style={styles.cartaoTexto}>
                        <Text style={styles.nome} numberOfLines={1}>{m.nome}</Text>
                        <Text style={styles.apoio} numberOfLines={1}>
                          {[variosLocais ? (localDoUsuario(m)?.nome ?? nomeDoLocal(localDoUsuario(m)?.id)) : null, m.unidade, m.email].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {!m.ativo && <Selo texto={tr('Bloqueado')} tom="erro" />}
                      {m.ativo && (m.precisa_trocar_senha || m.aparelho_nome === null) && <Selo texto={tr('Sem entrar')} tom="suave" />}
                    </Pressable>
                  ))}
                  {moradores.length === 0 && <Mensagem texto={tr('Nenhum morador cadastrado ainda. Use o botão acima para criar o primeiro.')} />}
                  {moradores.length > 0 && visiveis.length === 0 && <Mensagem texto={tr('Nenhum morador encontrado com esse filtro.')} />}
                </Bloco>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* O aviso de cobrança: interrompe de propósito, porque o toque seguinte gera uma cobrança */}
      <Modal visible={confirmando && cobrancaDoLocal !== null} transparent animationType="fade" onRequestClose={() => setConfirmando(false)} statusBarTranslucent>
        <View style={styles.veu}>
          <View style={styles.janela} accessibilityViewIsModal accessibilityLabel={tr('Confirmar a cobrança deste cadastro')}>
            <View style={styles.fio} pointerEvents="none" />
            <Text style={styles.janelaTitulo} accessibilityRole="header">{tr('Este cadastro é cobrado')}</Text>
            <Text style={styles.janelaValor}>{reais(cobrancaDoLocal?.valor_por_usuario ?? 0)}</Text>
            <Text style={styles.janelaTexto}>
              {tr('Ao criar o login de ')}{nome.trim().split(' ')[0] || tr('este morador')}{variosLocais && nomeDoLocal(localEscolhido) ? tr(' em {0}', [nomeDoLocal(localEscolhido)]) : ''}{tr(', esse valor é registrado na conta do condomínio, uma única vez.')}
            </Text>
            <Text style={styles.janelaTexto}>
              {tr('A soma do mês vai em boleto para a administradora do condomínio. Tirar o morador depois não cancela a cobrança.')}
            </Text>
            <Botao titulo={tr('Concordo e criar')} onPress={() => { void criar(true); }} carregando={criando} />
            <Botao titulo={tr('Voltar')} variante="secundario" onPress={() => setConfirmando(false)} desabilitado={criando} />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { paddingBottom: componentes.abas.reserva, width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center' },
  corpo: { paddingHorizontal: espaco[5], gap: espaco[6] },
  numeros: { flexDirection: 'row', gap: espaco[2.5] },
  linhaLocal: { gap: espaco[0.5], paddingTop: espaco[3], borderTopWidth: 1, borderTopColor: c.linha },
  criar: {
    ...aceso(c), borderRadius: raio.grande, minHeight: componentes.botao.altura + espaco[5],
    flexDirection: 'row', alignItems: 'center', gap: espaco[3.5], paddingHorizontal: espaco[5], paddingVertical: espaco[3.5],
  },
  criarTexto: { flex: 1, gap: espaco[0.5] },
  criarTitulo: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.sobreLuz },
  criarApoio: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.sobreLuz, opacity: 0.85 },
  formulario: { gap: espaco[4] },
  formularioTitulo: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, lineHeight: entrelinha.titulo, color: c.texto },
  acessos: { gap: espaco[2] },
  rotulo: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.texto },
  acoes: { flexDirection: 'row', gap: espaco[3] },
  acao: { flex: 1 },
  cartao: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[2], minHeight: componentes.linha.alturaMin + espaco[2],
    backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha,
    paddingHorizontal: espaco[4], paddingVertical: espaco[3],
  },
  cartaoPressionado: { borderColor: c.azul, boxShadow: c.brilho },
  cartaoTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.legenda, lineHeight: entrelinha.base, color: c.textoSuave },

  // edição em lote (a caixa de marcar é a mesma do SeletorDeAcessos)
  lote: { gap: espaco[3] },
  loteCabeca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco[3], flexWrap: 'wrap' },
  loteLink: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.azul },
  caixa: {
    width: componentes.caixaDeMarcar, height: componentes.caixaDeMarcar, borderRadius: espaco[1.5],
    borderWidth: 2, borderColor: c.textoSuave, alignItems: 'center', justifyContent: 'center',
  },
  caixaMarcada: { borderColor: c.luz, backgroundColor: c.luz, boxShadow: c.brilho },
  caixaMiolo: { width: componentes.caixaDeMarcar / 2.4, height: componentes.caixaDeMarcar / 2.4, borderRadius: espaco[0.5], backgroundColor: c.sobreLuz },

  // cobrança
  cobrancas: { backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha, paddingHorizontal: espaco[4] },
  cobranca: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin + espaco[2], paddingVertical: espaco[3] },
  cobrancaTotal: { borderTopWidth: 1, borderTopColor: c.linha },
  valor: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto, fontVariant: ['tabular-nums'] },

  // a janela do aviso, igual à de criar a senha: no meio da tela, sobre o fundo escurecido
  veu: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaco[5], backgroundColor: palco.veu },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, gap: espaco[4], overflow: 'hidden',
    ...vidro(c, 'flutuante'), backgroundColor: c.flutuante, borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6],
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  janelaTitulo: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, lineHeight: entrelinha.titulo, color: c.texto },
  janelaValor: { fontFamily: fontes.nome, fontSize: corpo.titulo + espaco[2], lineHeight: entrelinha.destaque, color: c.texto, fontVariant: ['tabular-nums'] },
  janelaTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
});
