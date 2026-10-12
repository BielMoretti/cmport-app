import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Botao, confirmar, Mensagem } from '@/components/formulario';
import { LogoPlaca, Tela } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { pedirBiometria } from '@/lib/biometria';
import { tr } from '@/lib/idioma';
import { componentes, corpo, entrelinha, espaco, fontes, raio, vidro, type Paleta } from '@/lib/tema';

/**
 * O aplicativo está trancado: antes de mostrar qualquer câmera, pede a digital ou o rosto
 * (ou o bloqueio de tela do aparelho). Enquanto esta tela está no lugar das outras, nenhuma
 * câmera é carregada nem tocada.
 *
 * Quem não conseguir passar pode sair da conta e entrar de novo com email e senha.
 */
export default function Trancado({ aoDestrancar }: { aoDestrancar: () => void }) {
  const styles = useEstilos(criarEstilos);
  const { usuario, logout } = useAuth();
  const [pedindo, setPedindo] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const destrancar = useCallback(async () => {
    setPedindo(true);
    setFalhou(false);
    const passou = await pedirBiometria(tr('Confirme que é você para abrir o CM Port'));
    setPedindo(false);
    if (passou) aoDestrancar();
    else setFalhou(true);
  }, [aoDestrancar]);

  // já pede ao aparecer, sem a pessoa precisar tocar em nada
  useEffect(() => { void destrancar(); }, [destrancar]);

  async function sair() {
    if (await confirmar(tr('Sair da conta?'), tr('Você vai precisar do email e da senha para entrar de novo.'), tr('Sair'))) {
      await logout();
    }
  }

  const primeiroNome = (usuario?.apelido || usuario?.nome || '').trim().split(' ')[0];

  return (
    <Tela>
      <View style={styles.centro}>
        <View style={styles.janela} accessibilityViewIsModal accessibilityLabel={tr('Aplicativo trancado')}>
          <View style={styles.fio} />
          <View style={styles.logo}><LogoPlaca tamanho={componentes.avatarGrande} /></View>
          <Text style={styles.titulo} accessibilityRole="header">
            {primeiroNome ? tr('{0}, confirme que é você', [primeiroNome]) : tr('Confirme que é você')}
          </Text>
          <Text style={styles.apoio}>{tr('Use a digital, o rosto ou o bloqueio de tela deste aparelho para ver as câmeras.')}</Text>
          {falhou && <Mensagem texto={tr('Não deu para confirmar. Tente de novo.')} tom="erro" />}
          <Botao titulo={tr('Destrancar')} onPress={() => { void destrancar(); }} carregando={pedindo} />
          <Botao titulo={tr('Sair da conta')} variante="secundario" onPress={() => { void sair(); }} desabilitado={pedindo} />
        </View>
      </View>
    </Tela>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: espaco[5] },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, gap: espaco[4], overflow: 'hidden',
    ...vidro(c, 'flutuante'), borderRadius: raio.grande + espaco[1], boxShadow: c.vidroSombra,
    paddingHorizontal: espaco[6], paddingTop: espaco[7], paddingBottom: espaco[6],
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  logo: { alignItems: 'center' },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo + espaco[1], lineHeight: entrelinha.destaque, color: c.texto, textAlign: 'center' },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, textAlign: 'center' },
});
