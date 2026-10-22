import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao, confirmar, Mensagem } from '@/components/formulario';
import { Tela } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { tr, trDoServidor } from '@/lib/idioma';
import { abrirPolitica, abrirTermos, POLITICA_DE_PRIVACIDADE, TERMOS_DE_USO } from '@/lib/suporte';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, vidro, type Paleta } from '@/lib/tema';

/**
 * Aceite dos Termos de uso: aparece no primeiro acesso e sempre que a CM Port publicar uma versão
 * nova dos termos. Até aceitar, é a única coisa na tela (ver _layout.tsx), no mesmo jeito da
 * janela de criar a senha.
 *
 * Quem decide se precisa é o servidor (`precisa_aceitar_termos` em /auth/me). Servidor que não
 * informa nada não trava ninguém. O aceite grava a versão e a hora (POST /auth/me/aceitar-termos).
 */
export default function AceiteTermos() {
  const styles = useEstilos(criarEstilos);
  const { usuario, aceitarTermos, logout } = useAuth();
  const [marcado, setMarcado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    if (!marcado) return;
    setSalvando(true);
    setErro(null);
    try {
      await aceitarTermos();
    } catch (e) {
      setErro(e instanceof ApiError ? trDoServidor(e.message) : tr('Não foi possível registrar o aceite. Tente de novo.'));
      setSalvando(false);
    }
  }

  async function abrir(qual: 'termos' | 'politica') {
    const ok = qual === 'termos' ? await abrirTermos() : await abrirPolitica();
    if (!ok) setErro(tr('Não foi possível abrir o navegador. O endereço é {0}.', [qual === 'termos' ? TERMOS_DE_USO : POLITICA_DE_PRIVACIDADE]));
  }

  async function sair() {
    if (await confirmar(tr('Sair da conta?'), tr('Sem aceitar os termos não dá para usar o aplicativo. Você pode entrar de novo quando quiser.'), tr('Sair'))) {
      await logout();
    }
  }

  const primeiroNome = usuario?.nome?.split(' ')[0];

  return (
    <Tela>
      <View style={styles.veu} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.centro}>
        <View style={styles.janela} accessibilityViewIsModal accessibilityLabel={tr('Termos de uso do aplicativo')}>
          <View style={styles.fio} />
          <Text style={styles.titulo} accessibilityRole="header">{tr('Termos de uso')}</Text>
          <Text style={styles.apoio}>
            {primeiroNome ? tr('{0}, antes de ver as câmeras, leia e aceite as regras de uso do aplicativo.', [primeiroNome]) : tr('Antes de ver as câmeras, leia e aceite as regras de uso do aplicativo.')}
          </Text>

          <View style={styles.resumo}>
            {[
              tr('As imagens são só para a segurança do condomínio: não publique nem compartilhe em redes sociais ou grupos.'),
              tr('A sua conta é pessoal: não empreste a senha.'),
              tr('Cada imagem leva uma marca d’água com o seu nome, e cada câmera aberta fica registrada.'),
              tr('Seus dados seguem a Política de privacidade da CM Port.'),
            ].map(item => (
              <View key={item} style={styles.item}>
                <View style={styles.ponto} />
                <Text style={styles.itemTexto}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.links}>
            <Pressable onPress={() => { void abrir('termos'); }} accessibilityRole="link" hitSlop={espaco[2]}>
              <Text style={styles.link}>{tr('Ler os Termos de uso')}</Text>
            </Pressable>
            <Pressable onPress={() => { void abrir('politica'); }} accessibilityRole="link" hitSlop={espaco[2]}>
              <Text style={styles.link}>{tr('Ler a Política de privacidade')}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setMarcado(m => !m)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: marcado }}
            style={styles.marcar}
          >
            <View style={[styles.caixa, marcado && styles.caixaMarcada]}>
              {marcado && <Text style={styles.visto}>✓</Text>}
            </View>
            <Text style={styles.marcarTexto}>
              {tr('Tenho 18 anos ou mais e li e aceito os Termos de uso e a Política de privacidade.')}
            </Text>
          </Pressable>

          {erro && <Mensagem texto={erro} tom="erro" />}

          <Botao titulo={tr('Aceitar e continuar')} onPress={aceitar} carregando={salvando} desabilitado={!marcado} />
          <Botao titulo={tr('Sair')} variante="secundario" onPress={() => { void sair(); }} desabilitado={salvando} />
        </View>
      </ScrollView>
    </Tela>
  );
}

const CAIXA = 24;

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
  resumo: { gap: espaco[3] },
  item: { flexDirection: 'row', gap: espaco[3], alignItems: 'flex-start' },
  ponto: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.azul, marginTop: espaco[2] },
  itemTexto: { flex: 1, fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
  links: { gap: espaco[3] },
  link: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul, textDecorationLine: 'underline' },
  marcar: { flexDirection: 'row', gap: espaco[3], alignItems: 'flex-start', minHeight: componentes.alvoDeToque, paddingVertical: espaco[1] },
  caixa: {
    width: CAIXA, height: CAIXA, borderRadius: raio.pequeno - 4, borderWidth: 2, borderColor: c.textoSuave,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  caixaMarcada: { backgroundColor: c.azul, borderColor: c.azul },
  visto: { fontFamily: fontes.nome, fontSize: corpo.base, lineHeight: CAIXA - 4, color: c.sobreLuz },
  marcarTexto: { flex: 1, fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
});
