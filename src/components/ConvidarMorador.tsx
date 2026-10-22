import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { GlifoPessoas } from '@/components/arte';
import { Toque } from '@/components/efeitos';
import { Botao, Campo, confirmar, Mensagem, Opcoes, Selo } from '@/components/formulario';
import SeletorDeAcessos, { camerasAlcancadas, type Acessos } from '@/components/SeletorDeAcessos';
import { Cartao } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import {
  cancelarConvite, gerarConvite, listarConvites, mensagemDoConvite, type Convite, type ConviteCriado, type SituacaoConvite,
} from '@/lib/convites';
import { tr } from '@/lib/idioma';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, vidro, type Paleta } from '@/lib/tema';
import { reais } from '@/lib/texto';
import type { Camera, CobrancaResumo, Poste } from '@/lib/types';

interface Local { id: number; nome: string }

const SEM_ACESSOS: Acessos = { postes: new Set(), cameras: new Set() };
const ROTULO: Record<SituacaoConvite, string> = { PENDENTE: 'Aguardando', USADO: 'Usado', CANCELADO: 'Cancelado', VENCIDO: 'Vencido' };

/** "2026-10-29T12:00:00" (UTC sem fuso) → "29/10" */
const diaCurto = (s: string) => new Date(s.endsWith('Z') ? s : `${s}Z`).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

/**
 * Convidar morador por link (aba Gestão). O síndico escolhe a unidade e as câmeras e gera um
 * link (com QR) para mandar pelo WhatsApp; o morador abre, cria a própria conta e já entra.
 * Vale 7 dias e uma vez só. Em condomínio que cobra, o síndico concorda antes de gerar; a
 * cobrança só nasce quando o morador entra. Abaixo, os convites já mandados (cancelar os pendentes).
 */
export default function ConvidarMorador({ locais, postes, cameras, cobrancas }: {
  locais: Local[]; postes: Poste[]; cameras: Camera[]; cobrancas: CobrancaResumo[];
}) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const [aberto, setAberto] = useState(false);
  const [unidade, setUnidade] = useState('');
  const [nome, setNome] = useState('');
  const [localId, setLocalId] = useState<number | null>(null);
  const [acessos, setAcessos] = useState<Acessos>(SEM_ACESSOS);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [criado, setCriado] = useState<ConviteCriado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [convites, setConvites] = useState<Convite[]>([]);

  const variosLocais = locais.length > 1;
  const localEscolhido = variosLocais ? localId : locais[0]?.id ?? null;
  const nomeDoLocal = (id: number | null) => locais.find(l => l.id === id)?.nome ?? null;
  const postesDoLocal = useMemo(() => postes.filter(p => p.condominio_id === localEscolhido), [postes, localEscolhido]);
  const camerasDoLocal = useMemo(() => cameras.filter(c => c.condominio_id === localEscolhido), [cameras, localEscolhido]);
  const totalLiberado = camerasAlcancadas(camerasDoLocal, acessos);
  const cobrancaDoLocal = cobrancas.find(c => c.condominio_id === localEscolhido && c.cobra) ?? null;
  const podeGerar = unidade.trim().length > 0 && localEscolhido !== null;

  const carregar = useCallback(async () => {
    try {
      setConvites(await listarConvites());
    } catch {
      // servidor sem os convites ainda: a lista só não aparece
    }
  }, []);
  useEffect(() => {
    // setTimeout(0): carrega depois da montagem, sem setState síncrono dentro do efeito
    const t = setTimeout(() => { void carregar(); }, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  function fechar() {
    setAberto(false); setConfirmando(false); setErro(null); setCriado(null); setCopiado(false);
    setUnidade(''); setNome(''); setLocalId(null); setAcessos(SEM_ACESSOS);
  }

  async function gerar(concordou = false) {
    if (!podeGerar || localEscolhido === null) return;
    if (cobrancaDoLocal && !concordou) { setConfirmando(true); return; }
    setConfirmando(false);
    setGerando(true);
    setErro(null);
    try {
      const c = await gerarConvite({
        condominio_id: localEscolhido, unidade: unidade.trim(), ...(nome.trim() ? { nome: nome.trim() } : {}),
        poste_ids: [...acessos.postes], camera_ids: [...acessos.cameras], ...(concordou ? { aceito_cobranca: true } : {}),
      });
      setCriado(c);
      void carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível gerar o convite. Tente de novo.'));
    } finally {
      setGerando(false);
    }
  }

  async function compartilhar() {
    if (!criado) return;
    const texto = mensagemDoConvite(criado.link, nomeDoLocal(criado.condominio_id), criado.unidade);
    // no navegador sem o painel de compartilhar, o link vai para a área de transferência
    if (Platform.OS === 'web' && !(globalThis.navigator as Navigator | undefined)?.share) { await copiar(); return; }
    try { await Share.share({ message: texto }); } catch { await copiar(); }
  }

  async function copiar() {
    if (!criado) return;
    await Clipboard.setStringAsync(criado.link);
    setCopiado(true);
  }

  async function cancelar(c: Convite) {
    if (!(await confirmar(tr('Cancelar convite?'), tr('O link da unidade {0} deixa de funcionar.', [c.unidade]), tr('Cancelar convite')))) return;
    try {
      await cancelarConvite(c.id);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível cancelar. Tente de novo.'));
    }
  }

  // os últimos convites (os pendentes primeiro)
  const recentes = useMemo(() => [...convites]
    .sort((a, b) => Number(b.situacao === 'PENDENTE') - Number(a.situacao === 'PENDENTE'))
    .slice(0, 8), [convites]);

  return (
    <View style={styles.bloco}>
      {!aberto ? (
        <Toque onPress={() => setAberto(true)} accessibilityRole="button" accessibilityLabel={tr('Convidar morador por link')} style={styles.abrir}>
          <GlifoPessoas cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />
          <View style={styles.abrirTexto}>
            <Text style={styles.abrirTitulo}>{tr('Convidar por link')}</Text>
            <Text style={styles.apoio}>{tr('Você manda o link e o morador preenche os próprios dados')}</Text>
          </View>
        </Toque>
      ) : criado ? (
        <Cartao destaque style={styles.formulario}>
          <Text style={styles.titulo} accessibilityRole="header">{tr('Convite pronto')}</Text>
          <Text style={styles.apoio}>
            {tr('Unidade {0}', [criado.unidade])}{nomeDoLocal(criado.condominio_id) && variosLocais ? ` · ${nomeDoLocal(criado.condominio_id)}` : ''}
            {tr(' · vale até {0}, uma vez só.', [diaCurto(criado.expira_em)])}
          </Text>
          <View style={styles.qr} accessibilityLabel={tr('QR code do convite')}>
            <QRCode value={criado.link} size={196} backgroundColor="#FFFFFF" color="#0B1220" quietZone={12} />
          </View>
          <Text style={styles.link} selectable>{criado.link}</Text>
          {copiado && <Mensagem tom="azul" texto={tr('Link copiado.')} />}
          <View style={styles.acoes}>
            <View style={styles.acao}><Botao titulo={tr('Copiar link')} variante="secundario" onPress={() => { void copiar(); }} /></View>
            <View style={styles.acao}><Botao titulo={tr('Compartilhar')} onPress={() => { void compartilhar(); }} /></View>
          </View>
          <Botao titulo={tr('Concluir')} variante="secundario" onPress={fechar} />
        </Cartao>
      ) : (
        <Cartao destaque style={styles.formulario}>
          <Text style={styles.titulo} accessibilityRole="header">{tr('Convite por link')}</Text>
          <Text style={styles.apoio}>{tr('O morador abre o link, instala o app e cria a própria senha. Ele já entra vendo as câmeras que você marcar aqui.')}</Text>
          <Campo rotulo={tr('Unidade')} value={unidade} onChangeText={setUnidade} maxLength={50} placeholder={tr('Ex.: Bloco B, apto 42')} autoFocus />
          <Campo rotulo={tr('Nome (opcional)')} value={nome} onChangeText={setNome} maxLength={150} ajuda={tr('Só para você reconhecer o convite na lista. Quem preenche o nome é o morador.')} />
          {variosLocais && (
            <Opcoes<number | null>
              rotulo={tr('Condomínio')}
              valor={localEscolhido}
              opcoes={locais.map(l => ({ valor: l.id, rotulo: l.nome }))}
              onChange={novo => { setLocalId(novo); setAcessos(SEM_ACESSOS); }}
            />
          )}
          {localEscolhido !== null && camerasDoLocal.length > 0 && (
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
            <Mensagem texto={tr('Sem nada marcado, o morador entra mas não vê nenhuma câmera até você liberar na ficha dele.')} />
          )}
          {cobrancaDoLocal && (
            <Mensagem tom="azul" texto={tr('Neste condomínio, cada morador cadastrado custa {0}. A cobrança só é registrada quando ele entrar pelo link.', [reais(cobrancaDoLocal.valor_por_usuario)])} />
          )}
          {erro && <Mensagem texto={erro} tom="erro" />}
          <View style={styles.acoes}>
            <View style={styles.acao}><Botao titulo={tr('Cancelar')} variante="secundario" onPress={fechar} desabilitado={gerando} /></View>
            <View style={styles.acao}><Botao titulo={tr('Gerar link')} onPress={() => { void gerar(); }} carregando={gerando} desabilitado={!podeGerar} /></View>
          </View>
        </Cartao>
      )}

      {recentes.length > 0 && (
        <View style={styles.lista}>
          <Text style={styles.rotulo}>{tr('Convites enviados')}</Text>
          {recentes.map(c => (
            <View key={c.id} style={styles.linha}>
              <View style={styles.linhaTexto}>
                <Text style={styles.linhaTitulo}>
                  {tr('Unidade {0}', [c.unidade])}{c.nome ? ` · ${c.nome}` : ''}
                </Text>
                <Text style={styles.apoio}>
                  {c.situacao === 'USADO' && c.usuario_nome
                    ? tr('Entrou: {0}', [c.usuario_nome])
                    : c.situacao === 'PENDENTE' ? tr('Vale até {0}', [diaCurto(c.expira_em)]) : tr(ROTULO[c.situacao])}
                  {variosLocais && nomeDoLocal(c.condominio_id) ? ` · ${nomeDoLocal(c.condominio_id)}` : ''}
                </Text>
              </View>
              {c.situacao === 'PENDENTE'
                ? <Toque onPress={() => { void cancelar(c); }} accessibilityRole="button" accessibilityLabel={tr('Cancelar o convite da unidade {0}', [c.unidade])} style={styles.cancelar}>
                    <Text style={styles.cancelarTexto}>{tr('Cancelar')}</Text>
                  </Toque>
                : <Selo texto={tr(ROTULO[c.situacao])} tom={c.situacao === 'USADO' ? 'azul' : 'suave'} />}
            </View>
          ))}
        </View>
      )}

      {/* o aviso de cobrança, como no cadastro: interrompe de propósito */}
      <Modal visible={confirmando && cobrancaDoLocal !== null} transparent animationType="fade" onRequestClose={() => setConfirmando(false)} statusBarTranslucent>
        <View style={styles.veu}>
          <View style={styles.janela} accessibilityViewIsModal accessibilityLabel={tr('Confirmar a cobrança deste convite')}>
            <View style={styles.fio} pointerEvents="none" />
            <Text style={styles.titulo} accessibilityRole="header">{tr('Este convite pode gerar cobrança')}</Text>
            <Text style={styles.valor}>{reais(cobrancaDoLocal?.valor_por_usuario ?? 0)}</Text>
            <Text style={styles.janelaTexto}>
              {tr('Quando o morador da unidade {0} entrar pelo link, esse valor é registrado na conta do condomínio, uma única vez. Se ninguém usar o convite, nada é cobrado.', [unidade.trim()])}
            </Text>
            <Botao titulo={tr('Concordo e gerar')} onPress={() => { void gerar(true); }} carregando={gerando} />
            <Botao titulo={tr('Voltar')} variante="secundario" onPress={() => setConfirmando(false)} desabilitado={gerando} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  bloco: { gap: espaco[4] },
  abrir: {
    ...vidro(c), borderRadius: raio.grande, minHeight: componentes.botao.altura + espaco[5],
    flexDirection: 'row', alignItems: 'center', gap: espaco[3.5], paddingHorizontal: espaco[5], paddingVertical: espaco[3.5],
  },
  abrirTexto: { flex: 1, gap: espaco[0.5] },
  abrirTitulo: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  formulario: { gap: espaco[4] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, lineHeight: entrelinha.titulo, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.legenda, lineHeight: entrelinha.base, color: c.textoSuave },
  rotulo: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, color: c.texto },
  acessos: { gap: espaco[2] },
  acoes: { flexDirection: 'row', gap: espaco[3] },
  acao: { flex: 1 },
  qr: { alignSelf: 'center', borderRadius: raio.medio, overflow: 'hidden' },
  link: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, textAlign: 'center' },
  lista: {
    gap: espaco[1], backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha,
    paddingHorizontal: espaco[4], paddingVertical: espaco[3],
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin, paddingVertical: espaco[2] },
  linhaTexto: { flex: 1, gap: espaco[0.5] },
  linhaTitulo: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto },
  cancelar: { minHeight: componentes.alvoDeToque, justifyContent: 'center', paddingHorizontal: espaco[2] },
  cancelarTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.erro },
  veu: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaco[5], backgroundColor: palco.veu },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, gap: espaco[4], overflow: 'hidden',
    ...vidro(c, 'flutuante'), backgroundColor: c.flutuante, borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6],
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  valor: { fontFamily: fontes.nome, fontSize: corpo.titulo + espaco[2], lineHeight: entrelinha.destaque, color: c.texto, fontVariant: ['tabular-nums'] },
  janelaTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
});
