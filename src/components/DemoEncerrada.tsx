import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao } from '@/components/formulario';
import { LogoPlaca, Tela } from '@/components/ui';
import { useEstilos } from '@/contexts/TemaContext';
import { tr } from '@/lib/idioma';
import { falarComACmPort } from '@/lib/suporte';
import { componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';

/**
 * O link da demonstração foi encerrado pela equipe ou venceu: o app já saiu (contexts/AuthContext)
 * e esta tela fica no lugar de todas as outras. Para continuar, só com um link novo.
 */
export default function DemoEncerrada() {
  const styles = useEstilos(criarEstilos);
  return (
    <Tela>
      <ScrollView contentContainerStyle={styles.centro}>
        <View style={styles.janela}>
          <View style={styles.fio} pointerEvents="none" />
          <LogoPlaca tamanho={componentes.logoPlaca.topo} />
          <Text style={styles.titulo} accessibilityRole="header">{tr('Demonstração encerrada')}</Text>
          <Text style={styles.apoio}>
            {tr('O prazo deste link acabou ou ele foi encerrado pela CM Port. Obrigado por conhecer o serviço. Para ver de novo, peça um link novo.')}
          </Text>
          <Botao titulo={tr('Falar com a CM Port')} variante="secundario" onPress={() => { void falarComACmPort(tr('Olá! Vi a demonstração das câmeras e quero saber mais.')); }} />
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
});
