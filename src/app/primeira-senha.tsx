import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Botao, Campo, Mensagem } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, vidro, type Paleta } from '@/lib/tema';
import { tr } from '@/lib/idioma';

/**
 * Primeiro acesso: a senha que o síndico (ou a CM Port) definiu serve só para entrar uma vez.
 * Antes de ver qualquer câmera, a pessoa cria uma senha que só ela conhece.
 *
 * Aparece como uma janela no meio da tela, logo depois do login, sem a pessoa precisar procurar
 * nada: é a única coisa disponível enquanto o servidor disser que a senha é provisória
 * (ver _layout.tsx). A regra de verdade é do servidor, que recusa as outras rotas até a troca.
 */
export default function PrimeiraSenhaScreen() {
  const styles = useEstilos(criarEstilos);
  const { usuario, logout, senhaInicial, concluirPrimeiraSenha } = useAuth();
  // a senha digitada no login fica só na memória; se o app foi reaberto, é pedida de novo
  const lembrada = senhaInicial();

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetida, setRepetida] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const senhaAtual = lembrada ?? atual;
  const diferente = nova !== '' && repetida !== '' && nova !== repetida;
  const igualAInicial = nova !== '' && nova === senhaAtual;
  const pode = senhaAtual !== '' && nova.length >= 6 && nova === repetida && !igualAInicial;

  async function trocar() {
    if (!pode) return;
    setSalvando(true);
    setErro(null);
    try {
      await api('/auth/trocar-senha', { method: 'POST', body: { senha_atual: senhaAtual, senha_nova: nova } });
      await concluirPrimeiraSenha();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível trocar a senha. Tente de novo.'));
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      {/* escurece o fundo: a janela é a única coisa a fazer agora */}
      <View style={styles.veu} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.centro} keyboardShouldPersistTaps="handled">
        <View style={styles.janela} accessibilityViewIsModal accessibilityLabel={tr('Crie a sua senha para continuar')}>
          <View style={styles.fio} />
          <Text style={styles.titulo} accessibilityRole="header">{tr('Crie a sua senha')}</Text>
          <Text style={styles.apoio}>
            {usuario?.nome ? `${usuario.nome.split(' ')[0]}, a` : 'A'} {tr('senha que você recebeu serve só para este primeiro acesso. Para continuar, escolha uma senha que só você conhece.')}
          </Text>

          {lembrada === null && (
            <Campo rotulo={tr('Senha que você recebeu')} value={atual} onChangeText={setAtual} secureTextEntry autoComplete="current-password" autoFocus />
          )}
          <Campo rotulo={tr('Senha nova')} value={nova} onChangeText={setNova} secureTextEntry autoComplete="new-password" autoFocus={lembrada !== null} ajuda={tr('Pelo menos 6 caracteres.')} />
          <Campo rotulo={tr('Repita a senha nova')} value={repetida} onChangeText={setRepetida} secureTextEntry autoComplete="new-password" onSubmitEditing={() => { void trocar(); }} />
          {igualAInicial && <Mensagem texto={tr('A senha nova precisa ser diferente da que você recebeu.')} tom="erro" />}
          {diferente && <Mensagem texto={tr('As duas senhas não são iguais.')} tom="erro" />}
          {erro && <Mensagem texto={erro} tom="erro" />}

          <Botao titulo={tr('Salvar e continuar')} onPress={trocar} carregando={salvando} desabilitado={!pode} />
          <Botao titulo={tr('Sair')} variante="secundario" onPress={() => { void logout(); }} desabilitado={salvando} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  veu: { ...StyleSheet.absoluteFill, backgroundColor: palco.veu },
  // a janela fica no meio da tela, na vertical e na horizontal
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
