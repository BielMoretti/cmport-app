import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import { BarraCarregando } from '@/components/efeitos';
import { Alternador, Botao, Campo, confirmar, LinhaInfo, Mensagem, Opcoes, Secao } from '@/components/formulario';
import { Toque } from '@/components/efeitos';
import { Avatar, Cabecalho, Cartao } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { biometriaDisponivel, biometriaLigada, guardarBiometria, pedirBiometria } from '@/lib/biometria';
import { avisosLigados, desligarAvisos, ligarAvisos, temNotificacoes } from '@/lib/notificacoes';
import { falarComACmPort, WHATSAPP_ESCRITO } from '@/lib/suporte';
import { apagarFoto, escolherFoto, salvarFoto } from '@/lib/foto';
import {
  buscarPerfil, dataParaIso, formatarDataDigitada, formatarTelefone, idadeDe, isoParaData, salvarPerfil, type Perfil,
} from '@/lib/perfil';
import { componentes, corpo, entrelinha, espaco, fontes, temas, type Modo, type Paleta } from '@/lib/tema';
import { definirIdioma, idiomaAtual, IDIOMAS, tr, type Idioma } from '@/lib/idioma';

/**
 * Minha conta: quem está logado, os dados pessoais (nome, como quer ser chamado, telefone,
 * nascimento e unidade), a aparência do app, a troca de senha e o sair.
 */
export default function ContaScreen() {
  const { usuario, logout, atualizarSessao, foto, definirFoto } = useAuth();
  const { modo, definir } = useTema();
  const styles = useEstilos(criarEstilos);
  const router = useRouter();

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [noServidor, setNoServidor] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);

  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [apelido, setApelido] = useState('');
  const [telefone, setTelefone] = useState('');
  const [nascimento, setNascimento] = useState('');   // DD/MM/AAAA, como a pessoa digita
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
  };

  useEffect(() => {
    let cancelado = false;
    buscarPerfil()
      .then(r => { if (!cancelado) { preencher(r.perfil); setNoServidor(r.noServidor); } })
      .catch(e => { if (!cancelado) setErroDeCarga(e instanceof ApiError ? e.message : tr('Não foi possível carregar os seus dados.')); })
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
      setAvisoFoto({ texto: onde === 'servidor' ? tr('Foto trocada.') : tr('Foto trocada. Por enquanto ela fica salva só neste aparelho.'), erro: false });
    } catch (e) {
      setAvisoFoto({ texto: e instanceof ApiError ? e.message : tr('Não foi possível trocar a foto. Tente de novo.'), erro: true });
    } finally {
      setMexendoNaFoto(false);
    }
  }

  async function removerFoto() {
    if (!perfil || mexendoNaFoto) return;
    if (!(await confirmar(tr('Remover a foto?'), tr('Voltam a aparecer as iniciais do seu nome.'), tr('Remover')))) return;
    setAvisoFoto(null);
    setMexendoNaFoto(true);
    try {
      await apagarFoto(perfil.id);
      definirFoto(null);
      setAvisoFoto({ texto: tr('Foto removida.'), erro: false });
    } catch (e) {
      setAvisoFoto({ texto: e instanceof ApiError ? e.message : tr('Não foi possível remover a foto. Tente de novo.'), erro: true });
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
    || (nascimentoIso ?? 'x') !== perfil.dataNascimento
  );
  const podeSalvarDados = mudou && nome.trim().length >= 2 && !telefoneRuim && nascimentoIso !== null;

  async function salvarDados() {
    if (!perfil || !podeSalvarDados || nascimentoIso === null) return;
    setSalvandoDados(true);
    setErroDados(null);
    setAvisoDados(null);
    try {
      const r = await salvarPerfil(perfil, { nome, apelido, telefone: digitosDoTelefone, dataNascimento: nascimentoIso, unidade: perfil.unidade });
      preencher(r.perfil);
      await atualizarSessao({ nome: r.perfil.nome, apelido: r.perfil.apelido });
      setAvisoDados(
        r.onde === 'servidor' ? tr('Dados salvos.')
          : r.nomeNaoMudou ? tr('Salvo só neste aparelho, e o nome não pôde ser trocado: o servidor ainda não permite. Peça a um administrador para corrigir o nome.')
            : tr('Salvo só neste aparelho. Quando o servidor for atualizado, os dados passam a valer em qualquer aparelho.'),
      );
    } catch (e) {
      setErroDados(e instanceof ApiError ? e.message : tr('Não foi possível salvar. Tente de novo.'));
    } finally {
      setSalvandoDados(false);
    }
  }

  // ── senha ──
  const diferente = nova !== '' && repetida !== '' && nova !== repetida;
  const podeTrocar = atual !== '' && nova.length >= 6 && nova === repetida && nova !== atual;

  function trocarIdioma(novo: Idioma) {
    if (novo === idiomaAtual()) return;
    // o servidor guarda a escolha: os e-mails de aviso saem no mesmo idioma
    api('/auth/me', { method: 'PATCH', body: { idioma: novo } }).catch(() => {});
    definirIdioma(novo);
  }

  async function trocarSenha() {
    if (!podeTrocar) return;
    setSalvandoSenha(true);
    setErroSenha(null);
    setAvisoSenha(null);
    try {
      await api('/auth/trocar-senha', { method: 'POST', body: { senha_atual: atual, senha_nova: nova } });
      setAtual(''); setNova(''); setRepetida('');
      setAvisoSenha(tr('Senha trocada. Use a nova na próxima vez que entrar.'));
    } catch (e) {
      setErroSenha(e instanceof ApiError ? e.message : tr('Não foi possível trocar a senha. Tente de novo.'));
    } finally {
      setSalvandoSenha(false);
    }
  }

  // ── trava do aplicativo (digital ou rosto) ──
  const [temBiometria, setTemBiometria] = useState(false);
  const [trava, setTrava] = useState(false);
  const [avisoTrava, setAvisoTrava] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void Promise.all([biometriaDisponivel(), biometriaLigada()]).then(([tem, ligada]) => {
      if (!cancelado) { setTemBiometria(tem); setTrava(tem && ligada); }
    });
    return () => { cancelado = true; };
  }, []);

  async function mudarTrava(ligar: boolean) {
    setAvisoTrava(null);
    // para ligar ou desligar, a pessoa confirma que é ela: assim ninguém desliga a trava de outro
    const passou = await pedirBiometria(ligar ? tr('Confirme para ligar a trava do aplicativo') : tr('Confirme para desligar a trava do aplicativo'));
    if (!passou) { setAvisoTrava(tr('Não deu para confirmar. A trava ficou como estava.')); return; }
    try {
      await guardarBiometria(ligar);
      setTrava(ligar);
    } catch {
      setAvisoTrava(tr('Não foi possível guardar a escolha neste aparelho.'));
    }
  }

  // ── aviso de câmera fora do ar (síndico e técnico) ──
  const [avisos, setAvisos] = useState(false);
  const [mudandoAvisos, setMudandoAvisos] = useState(false);
  const [erroAvisos, setErroAvisos] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void avisosLigados().then(ligados => { if (!cancelado) setAvisos(ligados); });
    return () => { cancelado = true; };
  }, []);

  async function mudarAvisos(ligar: boolean) {
    if (mudandoAvisos) return;
    setMudandoAvisos(true);
    setErroAvisos(null);
    try {
      if (ligar) await ligarAvisos();
      else await desligarAvisos();
      setAvisos(ligar);
    } catch (e) {
      setErroAvisos(e instanceof Error ? e.message : tr('Não foi possível ligar os avisos. Tente de novo.'));
    } finally {
      setMudandoAvisos(false);
    }
  }

  // ── falar com a CM Port ──
  const [erroSuporte, setErroSuporte] = useState<string | null>(null);

  async function abrirSuporte() {
    setErroSuporte(null);
    if (!(await falarComACmPort())) setErroSuporte(tr('Não foi possível abrir o WhatsApp neste aparelho. O número é {0}.', [WHATSAPP_ESCRITO]));
  }

  async function sair() {
    if (await confirmar(tr('Sair da conta?'), tr('Você vai precisar do email e da senha para entrar de novo.'), tr('Sair'))) {
      await logout();
    }
  }

  // ── excluir a conta ──
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  async function pedirExclusao() {
    const ok = await confirmar(
      tr('Excluir a sua conta?'),
      tr('A conta é desativada agora e você sai do aplicativo. Para voltar a ver as câmeras, será preciso um cadastro novo. Não dá para desfazer.'),
      tr('Excluir a conta'),
    );
    if (!ok) return;
    setExcluindo(true);
    setErroExclusao(null);
    try {
      await api('/auth/me/pedir-exclusao', { method: 'POST' });
      await logout();
    } catch (e) {
      setErroExclusao(e instanceof ApiError ? e.message : tr('Não foi possível registrar o pedido. Tente de novo.'));
      setExcluindo(false);
    }
  }

  const papel = perfil?.role ?? usuario?.role;

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={tr('Minha conta')} />
      <BarraCarregando ativa={carregando} />
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {/* quem é */}
        <Cartao style={styles.cartaoDeQuem}>
          <Toque onPress={() => { void trocarFoto(); }} disabled={!perfil || mexendoNaFoto} accessibilityRole="button" accessibilityLabel={tr('Trocar a foto do perfil')}>
            <Avatar tamanho={componentes.avatarGrande} />
          </Toque>
          <View style={styles.quemTexto}>
            <Text style={styles.nome} numberOfLines={2}>{perfil?.nome ?? usuario?.nome ?? ''}</Text>
            {perfil && <Text style={styles.apoio} numberOfLines={1}>{perfil.email}</Text>}
            {papel && <Text style={styles.papel}>{tr(NOME_DO_PAPEL[papel] ?? papel)}</Text>}
          </View>
        </Cartao>

        {perfil && (
          <View style={styles.acoesDaFoto}>
            <View style={styles.acaoDaFoto}>
              <Botao titulo={foto ? tr('Trocar foto') : tr('Escolher foto')} variante="secundario" onPress={() => { void trocarFoto(); }} carregando={mexendoNaFoto} />
            </View>
            {foto && (
              <View style={styles.acaoDaFoto}>
                <Botao titulo={tr('Remover foto')} variante="perigo" onPress={() => { void removerFoto(); }} desabilitado={mexendoNaFoto} />
              </View>
            )}
          </View>
        )}
        {avisoFoto && <Mensagem texto={avisoFoto.texto} tom={avisoFoto.erro ? 'erro' : 'azul'} />}

        {erroDeCarga && <Mensagem texto={erroDeCarga} tom="erro" />}

        {perfil && (
          <Secao titulo={tr('Seus dados')}>
            {!noServidor && (
              <Mensagem texto={tr('O servidor ainda não guarda estes dados. Por enquanto o que você preencher fica salvo só neste aparelho.')} />
            )}
            {/* no serviço de cliente o nome identifica a pessoa (cadastro e marca d'água): não muda por aqui */}
            {noServidor ? (
              <LinhaInfo rotulo={tr('Nome')} valor={perfil.nome} />
            ) : (
              <Campo rotulo={tr('Nome completo')} value={nome} onChangeText={setNome} autoCapitalize="words" autoComplete="name" />
            )}
            <Campo
              rotulo={tr('Como quer ser chamado')}
              value={apelido}
              onChangeText={setApelido}
              autoCapitalize="words"
              maxLength={60}
              placeholder={perfil.nome.split(' ')[0]}
              ajuda={tr('Aparece na saudação da tela inicial.')}
            />
            <Campo
              rotulo={tr('Telefone (WhatsApp)')}
              value={telefone}
              onChangeText={t => setTelefone(formatarTelefone(t))}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder="(11) 90000-0000"
              ajuda={telefoneRuim ? undefined : tr('Para a CM Port falar com você sobre as câmeras.')}
            />
            {telefoneRuim && <Mensagem texto={tr('Informe o telefone com DDD.')} tom="erro" />}
            <Campo
              rotulo={tr('Data de nascimento')}
              value={nascimento}
              onChangeText={t => setNascimento(formatarDataDigitada(t))}
              keyboardType="number-pad"
              placeholder={tr('DD/MM/AAAA')}
              maxLength={10}
              ajuda={idade !== null ? `${idade} ${idade === 1 ? tr('ano') : tr('anos')}.` : undefined}
            />
            {nascimentoIso === null && nascimento.length === 10 && <Mensagem texto={tr('Essa data não existe ou ainda não chegou.')} tom="erro" />}
            {/* o bloco e o apartamento são do cadastro: quem preenche e altera é o síndico */}
            {perfil.role === 'MORADOR' && (
              <LinhaInfo rotulo={tr('Bloco e apartamento')} valor={perfil.unidade ? tr('{0} (alterado só pelo síndico)', [perfil.unidade]) : tr('Não informado. Peça ao síndico.')} />
            )}
            {erroDados && <Mensagem texto={erroDados} tom="erro" />}
            {avisoDados && <Mensagem texto={avisoDados} tom="azul" />}
            <Botao titulo={tr('Salvar dados')} onPress={() => { void salvarDados(); }} carregando={salvandoDados} desabilitado={!podeSalvarDados} />
          </Secao>
        )}

        <Secao titulo={tr('Aparência')}>
          <Opcoes<Modo>
            rotulo={tr('Tema do aplicativo')}
            valor={modo}
            opcoes={temas.map(t => ({ valor: t.valor, rotulo: tr(t.rotulo) }))}
            onChange={definir}
          />
        </Secao>

        <Secao titulo={tr('Idioma')}>
          <Opcoes<Idioma>
            rotulo={tr('Idioma do aplicativo')}
            valor={idiomaAtual()}
            opcoes={IDIOMAS.map(i => ({ valor: i.valor, rotulo: i.nome }))}
            onChange={trocarIdioma}
          />
          <Mensagem texto={tr('Os e-mails de aviso também passam a chegar neste idioma.')} />
        </Secao>

        <Secao titulo={tr('Trocar a senha')}>
          <Campo rotulo={tr('Senha atual')} value={atual} onChangeText={setAtual} secureTextEntry autoComplete="current-password" />
          <Campo rotulo={tr('Senha nova')} value={nova} onChangeText={setNova} secureTextEntry autoComplete="new-password" ajuda={tr('Pelo menos 6 caracteres, diferente da atual.')} />
          <Campo rotulo={tr('Repita a senha nova')} value={repetida} onChangeText={setRepetida} secureTextEntry autoComplete="new-password" />
          {diferente && <Mensagem texto={tr('As duas senhas novas não são iguais.')} tom="erro" />}
          {erroSenha && <Mensagem texto={erroSenha} tom="erro" />}
          {avisoSenha && <Mensagem texto={avisoSenha} tom="azul" />}
          <Botao titulo={tr('Trocar senha')} variante="secundario" onPress={() => { void trocarSenha(); }} carregando={salvandoSenha} desabilitado={!podeTrocar} />
        </Secao>

        {temNotificacoes && (papel === 'SINDICO' || papel === 'TECNICO') && (
          <Secao titulo={tr('Avisos')}>
            <Alternador
              rotulo={tr('Avisar quando uma câmera cair')}
              descricao={tr('Uma notificação neste aparelho quando uma câmera fica 10 minutos sem vídeo, e outra quando ela volta.')}
              valor={avisos}
              onChange={novo => { void mudarAvisos(novo); }}
            />
            {erroAvisos && <Mensagem texto={erroAvisos} tom="erro" />}
          </Secao>
        )}

        <Secao titulo={tr('Segurança')}>
          {temBiometria ? (
            <Alternador
              rotulo={tr('Pedir digital ou rosto ao abrir')}
              descricao={tr('Quem pegar este aparelho desbloqueado não vê as câmeras. Vale só para este aparelho.')}
              valor={trava}
              onChange={novo => { void mudarTrava(novo); }}
            />
          ) : (
            <Mensagem texto={tr('Para trancar o aplicativo com digital ou rosto, cadastre primeiro a digital ou o rosto nas configurações deste aparelho.')} />
          )}
          {avisoTrava && <Mensagem texto={avisoTrava} tom="erro" />}
          <Botao titulo={tr('Ver meus acessos')} variante="secundario" onPress={() => router.push('/acessos')} />
        </Secao>

        <Secao titulo={tr('Ajuda')}>
          <Mensagem texto={tr('Dúvida, câmera fora do ar ou problema no aplicativo? Fale com a equipe da CM Port pelo WhatsApp.')} />
          {erroSuporte && <Mensagem texto={erroSuporte} tom="erro" />}
          <Botao titulo={tr('Falar com a CM Port')} variante="secundario" onPress={() => { void abrirSuporte(); }} />
        </Secao>

        <Secao titulo={tr('Sobre')}>
          <View>
            {papel && <LinhaInfo rotulo={tr('Nível de acesso')} valor={tr(NOME_DO_PAPEL[papel] ?? papel)} />}
            <LinhaInfo rotulo={tr('Versão do aplicativo')} valor={Constants.expoConfig?.version ?? '–'} />
          </View>
        </Secao>

        <Botao titulo={tr('Sair da conta')} variante="perigo" onPress={() => { void sair(); }} />

        {/* exigência da loja: a pessoa precisa conseguir pedir a exclusão da conta de dentro do app */}
        {noServidor && (
          <Secao titulo={tr('Excluir a minha conta')}>
            <Mensagem texto={tr('Ao pedir a exclusão, a sua conta é desativada na hora e você deixa de ver as câmeras. A CM Port conclui a exclusão dos seus dados. Não dá para desfazer pelo aplicativo.')} />
            {erroExclusao && <Mensagem texto={erroExclusao} tom="erro" />}
            <Botao titulo={tr('Pedir a exclusão da conta')} variante="perigo" onPress={() => { void pedirExclusao(); }} carregando={excluindo} />
          </Secao>
        )}
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
