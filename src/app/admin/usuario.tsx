import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Cabecalho } from '@/components/ui';
import { BarraCarregando } from '@/components/efeitos';
import { Alternador, Botao, Campo, confirmar, Mensagem, Opcoes, Secao } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { niveisQuePodeDar, NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Condominio, Role, Usuario } from '@/lib/types';

/**
 * Ficha de um usuário: nome, nível, bloqueio, senha nova e — para o MORADOR — os
 * condomínios que ele enxerga.
 *
 * As rotas /usuarios/{id}/condominios fazem parte da proposta de backend
 * (cmport-backend-proposta). Enquanto não forem publicadas, respondem 404 e a tela avisa.
 */
export default function FichaDoUsuarioScreen() {
  const { usuario: eu } = useAuth();
  const styles = useEstilos(criarEstilos);
  const { id } = useLocalSearchParams<{ id: string }>();
  const usuarioId = Number(id);
  const niveis = niveisQuePodeDar(eu?.role);

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [souEu, setSouEu] = useState(false);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // condomínios (só MORADOR)
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [vinculoIndisponivel, setVinculoIndisponivel] = useState(false);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [lista, quemSou] = await Promise.all([
          api<Usuario[]>('/usuarios'),
          api<{ id: number }>('/auth/me'),
        ]);
        const u = lista.find(x => x.id === usuarioId);
        if (cancelado) return;
        if (!u) { setErro('Usuário não encontrado.'); return; }
        setUsuario(u);
        setNome(u.nome);
        setSouEu(quemSou.id === u.id);
        if (u.role === 'MORADOR') {
          const todos = await api<Condominio[]>('/condominios?tipo=CONDOMINIO&ativo=true&limit=700');
          if (cancelado) return;
          setCondominios(todos);
          try {
            const { condominio_ids } = await api<{ condominio_ids: number[] }>(`/usuarios/${usuarioId}/condominios`);
            if (!cancelado) setMarcados(new Set(condominio_ids));
          } catch (e) {
            if (!cancelado && e instanceof ApiError && (e.status === 404 || e.status === 405)) setVinculoIndisponivel(true);
          }
        }
      } catch (e) {
        if (!cancelado) setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o usuário.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [usuarioId]);

  // só mexe em quem tem um nível que eu posso dar (usuario_service._pode_gerir)
  const possoAlterar = !!usuario && niveis.includes(usuario.role);

  async function alterar(mudanca: { nome?: string; role?: Role; ativo?: boolean; senha?: string }, feito: string) {
    if (!usuario) return;
    if (mudanca.ativo === false) {
      const ok = await confirmar('Bloquear este usuário?', `${usuario.nome} deixa de conseguir entrar no app e no sistema web, na hora.`, 'Bloquear');
      if (!ok) return;
    }
    if (mudanca.role && mudanca.role !== 'MORADOR' && usuario.role === 'MORADOR') {
      const ok = await confirmar(
        'Tirar do nível de morador?',
        `${usuario.nome} deixa de ser limitado aos condomínios dele e passa a ver todas as câmeras${mudanca.role === 'USUARIO' ? ' e o sistema web' : ''}.`,
        'Mudar nível',
      );
      if (!ok) return;
    }
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const novo = await api<Usuario>(`/usuarios/${usuario.id}`, { method: 'PATCH', body: mudanca });
      setUsuario(novo);
      setNome(novo.nome);
      setSenha('');
      setAviso(feito);
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 422
          ? 'O servidor não aceitou. Se o nível for Morador, ele ainda não existe no servidor.'
          : e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente de novo.',
      );
    } finally {
      setSalvando(false);
    }
  }

  async function salvarCondominios() {
    setSalvandoVinculo(true);
    setErro(null);
    setAviso(null);
    try {
      const { condominio_ids } = await api<{ condominio_ids: number[] }>(`/usuarios/${usuarioId}/condominios`, {
        method: 'PUT',
        body: { condominio_ids: [...marcados] },
      });
      setMarcados(new Set(condominio_ids));
      setAviso(condominio_ids.length === 0
        ? 'Salvo. Sem nenhum condomínio marcado, este morador não vê nenhuma câmera.'
        : `Salvo. ${usuario?.nome} vê ${condominio_ids.length} ${condominio_ids.length === 1 ? 'condomínio' : 'condomínios'}.`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar os condomínios. Tente de novo.');
    } finally {
      setSalvandoVinculo(false);
    }
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    const lista = termo ? condominios.filter(c => c.nome.toUpperCase().includes(termo)) : condominios;
    // marcados primeiro, pra a pessoa ver de cara o que já está liberado
    return [...lista].sort((a, b) => Number(marcados.has(b.id)) - Number(marcados.has(a.id)) || a.nome.localeCompare(b.nome));
  }, [condominios, busca, marcados]);

  const alternar = (cid: number) => setMarcados(atual => {
    const novo = new Set(atual);
    if (novo.has(cid)) novo.delete(cid); else novo.add(cid);
    return novo;
  });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={'Usuário'} />
      <BarraCarregando ativa={carregando} />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {usuario && (
          <View>
            <Text style={styles.titulo}>{usuario.nome}</Text>
            <Text style={styles.email}>{usuario.email}</Text>
          </View>
        )}
        {erro && <Mensagem texto={erro} tom="erro" />}
        {aviso && <Mensagem texto={aviso} tom="azul" />}

        {usuario && souEu && (
          <Mensagem texto="Esta é a sua conta. O servidor não deixa você mudar o próprio nível nem se bloquear; peça a outro gestor." />
        )}
        {usuario && !souEu && !possoAlterar && (
          <Mensagem texto={`Este usuário é ${NOME_DO_PAPEL[usuario.role].toLowerCase()}. O seu nível não permite alterá-lo.`} />
        )}

        {usuario && possoAlterar && (
          <>
            <Secao titulo="Dados">
              <Campo rotulo="Nome" value={nome} onChangeText={setNome} />
              <Botao
                titulo="Salvar nome"
                variante="secundario"
                onPress={() => { void alterar({ nome: nome.trim() }, 'Nome salvo.'); }}
                carregando={salvando}
                desabilitado={nome.trim().length < 2 || nome.trim() === usuario.nome}
              />
            </Secao>

            {!souEu && (
              <Secao titulo="Acesso">
                <Opcoes
                  rotulo="Nível"
                  valor={usuario.role}
                  opcoes={niveis.map(valor => ({ valor, rotulo: NOME_DO_PAPEL[valor] }))}
                  onChange={role => { if (role !== usuario.role) void alterar({ role }, `Agora é ${NOME_DO_PAPEL[role].toLowerCase()}.`); }}
                />
                <Alternador
                  rotulo="Pode entrar"
                  descricao="Desligado, a pessoa é desconectada na hora."
                  valor={usuario.ativo}
                  onChange={ativo => { void alterar({ ativo }, ativo ? 'Acesso liberado.' : 'Usuário bloqueado.'); }}
                />
              </Secao>
            )}

            <Secao titulo="Senha nova">
              <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry ajuda="Pelo menos 6 caracteres. Passe para a pessoa por um canal seguro." />
              <Botao
                titulo="Redefinir senha"
                variante="secundario"
                onPress={() => { void alterar({ senha }, 'Senha redefinida.'); }}
                carregando={salvando}
                desabilitado={senha.length < 6}
              />
            </Secao>
          </>
        )}

        {usuario?.role === 'MORADOR' && possoAlterar && (
          <Secao titulo="Condomínios que este morador vê">
            {vinculoIndisponivel ? (
              <Mensagem texto="O servidor ainda não tem a função de liberar condomínios por morador. Ela faz parte da proposta de backend que aguarda publicação." tom="erro" />
            ) : (
              <>
                <Mensagem texto={`${marcados.size} ${marcados.size === 1 ? 'marcado' : 'marcados'}. Síndico ou zelador de mais de um prédio pode ter vários.`} />
                <Campo rotulo="Buscar condomínio" placeholder="Pelo nome" autoCorrect={false} value={busca} onChangeText={setBusca} />
                <View>
                  {visiveis.slice(0, 40).map(c => {
                    const marcado = marcados.has(c.id);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => alternar(c.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: marcado }}
                        accessibilityLabel={c.nome}
                        style={({ pressed }) => [styles.linha, pressed && styles.linhaPressionada]}
                      >
                        <View style={[styles.caixa, marcado && styles.caixaMarcada]}>
                          {marcado && <View style={styles.caixaMiolo} />}
                        </View>
                        <Text style={[styles.linhaNome, marcado && styles.linhaNomeMarcado]} numberOfLines={2}>{c.nome}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {visiveis.length > 40 && <Mensagem texto={`Mostrando 40 de ${visiveis.length}. Use a busca para achar os outros.`} />}
                <Botao titulo="Salvar condomínios" onPress={salvarCondominios} carregando={salvandoVinculo} />
              </>
            )}
          </Secao>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[6] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  email: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.alvoDeToque + espaco[1],
    paddingVertical: espaco[2], borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  linhaPressionada: { backgroundColor: c.azulSuave },
  caixa: {
    width: componentes.caixaDeMarcar, height: componentes.caixaDeMarcar, borderRadius: espaco[1.5],
    borderWidth: 2, borderColor: c.textoSuave, alignItems: 'center', justifyContent: 'center',
  },
  caixaMarcada: { borderColor: c.luz, backgroundColor: c.luz, boxShadow: c.brilho },
  caixaMiolo: { width: componentes.caixaDeMarcar / 2.4, height: componentes.caixaDeMarcar / 2.4, borderRadius: espaco[0.5], backgroundColor: c.sobreLuz },
  linhaNome: { flex: 1, fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  linhaNomeMarcado: { fontFamily: fontes.textoForte, color: c.texto },
});
