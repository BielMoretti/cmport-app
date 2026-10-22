import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao } from '@/components/formulario';
import { useEstilos } from '@/contexts/TemaContext';
import { api } from '@/lib/api';
import { escolherIdioma, idiomaAtual, idiomaFoiEscolhido, IDIOMAS, type Idioma } from '@/lib/idioma';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, vidro, type Paleta } from '@/lib/tema';

/**
 * Primeiro login neste aparelho: a pessoa escolhe o idioma do aplicativo (antes valia o do
 * aparelho, sem perguntar). Aparece uma vez só; depois muda em Minha conta. A escolha vai
 * também para o servidor, para os e-mails de aviso saírem no mesmo idioma.
 *
 * `useIdiomaPendente` diz se a janela ainda precisa aparecer (o convite "Proteja sua conta"
 * espera ela sair, para as duas janelas não se sobreporem).
 */
export function useIdiomaPendente(): [boolean | null, () => void] {
  const [pendente, setPendente] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    void idiomaFoiEscolhido().then(escolhido => { if (vivo) setPendente(!escolhido); });
    return () => { vivo = false; };
  }, []);
  return [pendente, () => setPendente(false)];
}

// o nome de cada idioma no próprio idioma, e o pedido nos dois: quem não lê português também entende
const TITULO = 'Escolha o idioma · Choose your language';

export default function EscolherIdioma({ aoEscolher }: { aoEscolher: () => void }) {
  const styles = useEstilos(criarEstilos);
  const [marcado, setMarcado] = useState<Idioma>(idiomaAtual());

  function confirmar() {
    // o servidor guarda a escolha (e-mails de aviso no mesmo idioma); falhar aqui não impede nada
    api('/auth/me', { method: 'PATCH', body: { idioma: marcado } }).catch(() => {});
    aoEscolher();
    escolherIdioma(marcado);
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={confirmar} statusBarTranslucent>
      <View style={styles.veu} />
      <ScrollView contentContainerStyle={styles.centro}>
        <View style={styles.janela} accessibilityViewIsModal accessibilityLabel={TITULO}>
          <View style={styles.fio} />
          <Text style={styles.titulo} accessibilityRole="header">{TITULO}</Text>
          <View style={styles.opcoes} accessibilityRole="radiogroup">
            {IDIOMAS.map(i => (
              <Pressable
                key={i.valor}
                onPress={() => setMarcado(i.valor)}
                accessibilityRole="radio"
                accessibilityState={{ selected: marcado === i.valor }}
                style={[styles.opcao, marcado === i.valor && styles.opcaoMarcada]}
              >
                <View style={[styles.bolinha, marcado === i.valor && styles.bolinhaMarcada]}>
                  {marcado === i.valor && <View style={styles.miolo} />}
                </View>
                <Text style={styles.opcaoTexto}>{i.nome}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.apoio}>
            {marcado === 'en' ? 'You can change it later in My account.' : 'Dá para mudar depois em Minha conta.'}
          </Text>
          <Botao titulo={marcado === 'en' ? 'Continue' : 'Continuar'} onPress={confirmar} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const BOLINHA = 22;

const criarEstilos = (c: Paleta) => StyleSheet.create({
  veu: { ...StyleSheet.absoluteFill, backgroundColor: palco.veu },
  centro: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: espaco[5] },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, gap: espaco[4], overflow: 'hidden',
    ...vidro(c, 'flutuante'), borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6],
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.destaque, color: c.texto },
  opcoes: { gap: espaco[2] },
  opcao: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.alvoDeToque + espaco[2],
    paddingHorizontal: espaco[4], borderRadius: raio.medio, borderWidth: 1, borderColor: c.linha,
  },
  opcaoMarcada: { borderColor: c.azul },
  bolinha: { width: BOLINHA, height: BOLINHA, borderRadius: BOLINHA / 2, borderWidth: 2, borderColor: c.textoSuave, alignItems: 'center', justifyContent: 'center' },
  bolinhaMarcada: { borderColor: c.azul },
  miolo: { width: BOLINHA / 2, height: BOLINHA / 2, borderRadius: BOLINHA / 4, backgroundColor: c.azul },
  opcaoTexto: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.pequeno, lineHeight: entrelinha.base, color: c.textoSuave },
});

