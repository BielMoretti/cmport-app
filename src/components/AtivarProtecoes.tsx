import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao, Mensagem } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { lerItem, salvarItem } from '@/lib/armazenamento';
import { biometriaDisponivel, biometriaLigada, guardarBiometria, pedirBiometria } from '@/lib/biometria';
import { tr } from '@/lib/idioma';
import { avisosLigados, ligarAvisos, temNotificacoes } from '@/lib/notificacoes';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, vidro, type Paleta } from '@/lib/tema';

/**
 * Logo depois do login: convida a ligar a digital (trava do aplicativo) e, para síndico e
 * técnico, o aviso de câmera parada — o morador não recebe esse aviso (o servidor só manda para
 * síndico e técnico), então para ele aparece só a digital.
 *
 * Só oferece o que ainda está desligado e que o aparelho tem (sem digital cadastrada, sem o
 * item). "Agora não" guarda a hora e o convite volta uma única vez, 7 dias depois. A escolha é
 * por aparelho e por conta (o mesmo celular pode ter outra pessoa logada). Tudo continua na tela
 * Minha conta.
 */
const LEMBRAR_DEPOIS = 7 * 24 * 60 * 60 * 1000;
const chave = (id: number) => `cmport_convite_protecoes_${id}`;   // "<vezes recusadas>:<quando>"; "feito" = acabou

type Item = 'digital' | 'avisos';

/** Quem está logado: o `sub` do token (o mesmo jeito de ler o token do AuthContext). */
function contaDoToken(token: string): number | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const sub = Number((JSON.parse(atob(base64)) as { sub?: string }).sub);
    return Number.isFinite(sub) ? sub : null;
  } catch {
    return null;
  }
}

/** Deve aparecer agora? Lê o que foi guardado da última vez. */
function convidarDeNovo(guardado: string | null, agora: number): boolean {
  if (!guardado) return true;
  if (guardado === 'feito') return false;
  const [vezes, quando] = guardado.split(':').map(Number);
  return vezes < 2 && agora - (quando || 0) >= LEMBRAR_DEPOIS;
}

export default function AtivarProtecoes() {
  const styles = useEstilos(criarEstilos);
  const { usuario } = useAuth();
  const [itens, setItens] = useState<Item[]>([]);
  const [ligados, setLigados] = useState<Item[]>([]);
  const [rodando, setRodando] = useState<Item | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);

  const id = usuario ? contaDoToken(usuario.token) : null;
  const papel = usuario?.role;

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    void (async () => {
      const guardado = await lerItem(chave(id)).catch(() => null);
      if (!convidarDeNovo(guardado, Date.now())) return;
      const [tem, digital, avisos] = await Promise.all([biometriaDisponivel(), biometriaLigada(), avisosLigados()]);
      const lista: Item[] = [];
      if (tem && !digital) lista.push('digital');
      if (temNotificacoes && (papel === 'SINDICO' || papel === 'TECNICO') && !avisos) lista.push('avisos');
      if (!cancelado && lista.length) { setItens(lista); setAberta(true); }
    })();
    return () => { cancelado = true; };
  }, [id, papel]);

  if (!aberta || !id) return null;

  const tudoLigado = itens.every(i => ligados.includes(i));

  async function fechar(feito: boolean) {
    setAberta(false);
    const guardado = await lerItem(chave(id!)).catch(() => null);
    const vezes = guardado && guardado !== 'feito' ? Number(guardado.split(':')[0]) || 0 : 0;
    await salvarItem(chave(id!), feito ? 'feito' : `${vezes + 1}:${Date.now()}`).catch(() => {});
  }

  async function ligar(item: Item) {
    setErro(null);
    setRodando(item);
    try {
      if (item === 'digital') {
        if (!(await pedirBiometria(tr('Confirme para ligar a trava do aplicativo')))) {
          setErro(tr('Não deu para confirmar. Você pode ligar depois em Minha conta.'));
          return;
        }
        await guardarBiometria(true);
      } else {
        await ligarAvisos();
      }
      setLigados(l => [...l, item]);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : tr('Não foi possível ligar agora. Você pode tentar depois em Minha conta.'));
    } finally {
      setRodando(null);
    }
  }

  const textos: Record<Item, { titulo: string; descricao: string; botao: string }> = {
    digital: {
      titulo: tr('Digital ou rosto ao abrir'),
      descricao: tr('Quem pegar o seu celular desbloqueado não vê as câmeras.'),
      botao: tr('Ligar a digital'),
    },
    avisos: {
      titulo: tr('Aviso de câmera parada'),
      descricao: tr('Uma notificação quando uma câmera fica 10 minutos sem vídeo, e outra quando ela volta.'),
      botao: tr('Ligar os avisos'),
    },
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => { void fechar(false); }} statusBarTranslucent>
      <View style={styles.veu} />
      <ScrollView contentContainerStyle={styles.centro}>
        <View style={styles.janela} accessibilityViewIsModal accessibilityLabel={tr('Proteja sua conta')}>
          <View style={styles.fio} />
          <Text style={styles.titulo} accessibilityRole="header">{tr('Proteja sua conta')}</Text>
          <Text style={styles.apoio}>{tr('Leva um minuto e vale só para este aparelho. Dá para mudar depois em Minha conta.')}</Text>

          {itens.map(item => {
            const ligado = ligados.includes(item);
            return (
              <View key={item} style={styles.item}>
                <Text style={styles.itemTitulo}>{textos[item].titulo}</Text>
                <Text style={styles.itemTexto}>{textos[item].descricao}</Text>
                {ligado
                  ? <Text style={styles.ligado} accessibilityLiveRegion="polite">{tr('Ligado')}</Text>
                  : <Botao titulo={textos[item].botao} variante="secundario" onPress={() => { void ligar(item); }}
                      carregando={rodando === item} desabilitado={rodando !== null} />}
              </View>
            );
          })}

          {erro && <Mensagem texto={erro} tom="erro" />}

          {tudoLigado
            ? <Botao titulo={tr('Concluir')} onPress={() => { void fechar(true); }} />
            : <Botao titulo={tr('Agora não')} variante="secundario" onPress={() => { void fechar(false); }}
                desabilitado={rodando !== null} />}
        </View>
      </ScrollView>
    </Modal>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  veu: { ...StyleSheet.absoluteFill, backgroundColor: palco.veu },
  centro: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: espaco[5] },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, gap: espaco[4], overflow: 'hidden',
    ...vidro(c, 'flutuante'), borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6],
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo + espaco[1], lineHeight: entrelinha.destaque, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  item: { gap: espaco[2], paddingTop: espaco[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.vidroFio },
  itemTitulo: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
  itemTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  ligado: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul, paddingVertical: espaco[2] },
});
