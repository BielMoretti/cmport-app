import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Botao, Mensagem } from '@/components/formulario';
import { LogoPlaca, Tela } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { ehDemo } from '@/lib/acesso';
import { ApiError } from '@/lib/api';
import { avisarAbertura, entrarNaDemo, lerCodigoDoLink, limparFragmentoDaRota, type Demonstracao } from '@/lib/demo';
import { localeAtual, tr, trDoServidor } from '@/lib/idioma';
import { componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';

const LINK_INVALIDO = 'Link inválido ou encerrado.';

/**
 * Link de demonstração (app.cmport.com.br/demo/entrar#<código>, ver lib/demo.ts): troca o código
 * pela demonstração, mostra para quem é, até quando vale e o aviso de que é só para avaliar.
 * Um toque em "Entendi, entrar" abre as câmeras. Sem senha e sem conta.
 */
export default function EntrarNaDemoScreen() {
  const styles = useEstilos(criarEstilos);
  const router = useRouter();
  const { entrarDemo, usuario } = useAuth();
  const [codigo] = useState(lerCodigoDoLink);
  // o Expo Router guarda o # no estado da navegação e o escreveria de volta na barra: a tela é
  // aberta de novo sem ele, uma vez só
  useEffect(() => { if (limparFragmentoDaRota()) router.replace('/entrar'); }, [router]);
  const [sessao, setSessao] = useState<{ token: string; demo: Demonstracao } | null>(null);
  // sem código ou recusado: o título e a explicação
  const [falha, setFalha] = useState<{ titulo: string; texto: string } | null>(
    codigo ? null : { titulo: tr(LINK_INVALIDO), texto: tr('Confira se o endereço chegou inteiro ou peça um link novo à CM Port.') },
  );

  useEffect(() => {
    if (!codigo) return;
    let vivo = true;
    entrarNaDemo(codigo)
      .then(s => { if (vivo) setSessao(s); })
      .catch(e => {
        if (!vivo) return;
        if (e instanceof ApiError && e.status === 404) setFalha({ titulo: tr('Demonstração encerrada'), texto: tr(LINK_INVALIDO) });
        else setFalha({ titulo: tr('Não foi possível abrir'), texto: e instanceof ApiError && e.status !== 0 ? trDoServidor(e.message) : tr('Confira a internet e tente de novo.') });
      });
    return () => { vivo = false; };
  }, [codigo]);

  // a navegação espera a sessão nova valer: antes disso as abas ainda estão fechadas (_layout.tsx)
  const [entrou, setEntrou] = useState(false);
  const demoAberta = ehDemo(usuario?.role);
  useEffect(() => { if (entrou && demoAberta) router.replace('/'); }, [entrou, demoAberta, router]);

  const [abrindo, setAbrindo] = useState(false);
  async function entrar() {
    if (!sessao || abrindo) return;
    setAbrindo(true);
    entrarDemo(sessao);
    // a abertura só conta depois deste toque, uma vez (recarregar a aba não chama de novo)
    try {
      await avisarAbertura();
    } catch (e) {
      // 401: encerrado ou vencido; o api já saiu e o _layout mostra "Demonstração encerrada".
      // Falha de rede ou outra: entra mesmo assim, o pulso confere depois.
      if (e instanceof ApiError && e.status === 401) return;
    }
    setEntrou(true);
  }

  const vence = sessao ? new Date(sessao.demo.expiraEm) : null;

  return (
    <Tela>
      <ScrollView contentContainerStyle={styles.centro}>
        <View style={styles.janela}>
          <View style={styles.fio} pointerEvents="none" />
          <LogoPlaca tamanho={componentes.logoPlaca.topo} />
          {!sessao && !falha && <Text style={styles.apoio}>{tr('Abrindo a demonstração…')}</Text>}

          {falha && (
            <>
              <Text style={styles.titulo} accessibilityRole="header">{falha.titulo}</Text>
              <Mensagem texto={falha.texto} tom="erro" />
            </>
          )}

          {sessao && vence && (
            <>
              <Text style={styles.titulo} accessibilityRole="header">{tr('Demonstração para {0}', [sessao.demo.prospecto])}</Text>
              {sessao.demo.condominios.length > 0 && (
                <Text style={styles.apoio}>
                  {tr('Câmeras de: {0}.', [sessao.demo.condominios.map(c => c.nome).join(', ')])}
                </Text>
              )}
              <Text style={styles.apoio}>
                {tr('Vale até {0} às {1}.', [
                  vence.toLocaleDateString(localeAtual(), { day: '2-digit', month: '2-digit', year: 'numeric' }),
                  vence.toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' }),
                ])}
              </Text>
              <View style={styles.aviso}>
                <Text style={styles.avisoTitulo}>{tr('Antes de entrar')}</Text>
                <Text style={styles.avisoTexto}>
                  {tr('Estas são câmeras reais, abertas só para você avaliar o serviço. É proibido gravar a tela, fotografar ou repassar as imagens e este link. Tudo o que você vê leva o seu nome na imagem.')}
                </Text>
              </View>
              <Botao titulo={tr('Entendi, entrar')} onPress={() => { void entrar(); }} carregando={abrindo} />
            </>
          )}
        </View>
      </ScrollView>
    </Tela>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  centro: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: espaco[5] },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, gap: espaco[4], overflow: 'hidden',
    ...vidro(c, 'flutuante'), borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6],
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo + espaco[1], lineHeight: entrelinha.destaque, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  aviso: { gap: espaco[1.5], padding: espaco[4], borderRadius: raio.medio, borderWidth: 1, borderColor: c.azul, backgroundColor: c.azulSuave },
  avisoTitulo: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto },
  avisoTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
});
