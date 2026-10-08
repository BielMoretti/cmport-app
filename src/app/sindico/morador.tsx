import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Cabecalho } from '@/components/ui';
import { BarraCarregando } from '@/components/efeitos';
import { Alternador, Botao, Campo, confirmar, formatarData, Mensagem, Opcoes, Secao } from '@/components/formulario';
import SeletorDeAcessos, { camerasAlcancadas } from '@/components/SeletorDeAcessos';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos } from '@/contexts/TemaContext';
import { niveisQuePodeDar, NOME_DO_PAPEL } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera, Poste, Role, Usuario } from '@/lib/types';

/**
 * Ficha de um usuário: nome, nível, bloqueio, senha nova e — para o MORADOR — o que
 * ele enxerga: postes inteiros e câmeras liberadas uma a uma.
 *
 * As rotas /usuarios/{id}/acessos fazem parte da proposta de backend
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

  // o que o morador vê (só MORADOR): postes inteiros e câmeras uma a uma
  const [postes, setPostes] = useState<Poste[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [postesMarcados, setPostesMarcados] = useState<Set<number>>(new Set());
  const [camerasMarcadas, setCamerasMarcadas] = useState<Set<number>>(new Set());
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
        if (!u) { setErro('Morador não encontrado.'); return; }
        setUsuario(u);
        setNome(u.nome);
        setSouEu(quemSou.id === u.id);
        if (u.role === 'MORADOR') {
          const [listaPostes, listaCameras] = await Promise.all([api<Poste[]>('/postes'), api<Camera[]>('/cameras')]);
          if (cancelado) return;
          setPostes(listaPostes);
          setCameras(listaCameras);
          try {
            const acessos = await api<{ poste_ids: number[]; camera_ids: number[] }>(`/usuarios/${usuarioId}/acessos`);
            if (!cancelado) { setPostesMarcados(new Set(acessos.poste_ids)); setCamerasMarcadas(new Set(acessos.camera_ids)); }
          } catch (e) {
            if (!cancelado && e instanceof ApiError && (e.status === 404 || e.status === 405)) setVinculoIndisponivel(true);
          }
        }
      } catch (e) {
        if (!cancelado) setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o morador.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [usuarioId]);

  async function liberarAparelho() {
    if (!usuario) return;
    const ok = await confirmar(
      'Liberar a troca de aparelho?',
      `${usuario.nome} é desconectado do aparelho atual, e o próximo celular que entrar com este login passa a ser o registrado.`,
      'Liberar',
    );
    if (!ok) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      setUsuario(await api<Usuario>(`/usuarios/${usuario.id}/aparelho`, { method: 'DELETE' }));
      setAviso('Troca liberada. O próximo aparelho que entrar fica registrado.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível liberar a troca. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  // só mexe em quem tem um nível que eu posso dar (usuario_service._pode_gerir)
  const possoAlterar = !!usuario && niveis.includes(usuario.role);

  async function alterar(mudanca: { nome?: string; role?: Role; ativo?: boolean; senha?: string; so_um_aparelho?: boolean }, feito: string) {
    if (!usuario) return;
    if (mudanca.ativo === false) {
      const ok = await confirmar('Bloquear este usuário?', `${usuario.nome} deixa de conseguir entrar no app e no sistema web, na hora.`, 'Bloquear');
      if (!ok) return;
    }
    if (mudanca.role && mudanca.role !== 'MORADOR' && usuario.role === 'MORADOR') {
      const ok = await confirmar(
        'Tirar do nível de morador?',
        `${usuario.nome} deixa de ser limitado aos postes e câmeras liberados e passa a ver todas as câmeras${mudanca.role === 'USUARIO' ? ' e o sistema web' : ''}.`,
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

  async function salvarAcessos() {
    setSalvandoVinculo(true);
    setErro(null);
    setAviso(null);
    try {
      const salvo = await api<{ poste_ids: number[]; camera_ids: number[] }>(`/usuarios/${usuarioId}/acessos`, {
        method: 'PUT',
        body: { poste_ids: [...postesMarcados], camera_ids: [...camerasMarcadas] },
      });
      setPostesMarcados(new Set(salvo.poste_ids));
      setCamerasMarcadas(new Set(salvo.camera_ids));
      setAviso(salvo.poste_ids.length + salvo.camera_ids.length === 0
        ? 'Salvo. Sem nada marcado, este morador não vê nenhuma câmera.'
        : `Salvo. ${usuario?.nome} vê ${totalVisto} ${totalVisto === 1 ? 'câmera' : 'câmeras'}.`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o que o morador vê. Tente de novo.');
    } finally {
      setSalvandoVinculo(false);
    }
  }

  // quantas câmeras o morador vê de fato: as dos postes marcados mais as marcadas uma a uma
  const totalVisto = camerasAlcancadas(cameras, { postes: postesMarcados, cameras: camerasMarcadas });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={'Morador'} />
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
                {niveis.length > 1 && (
                  <Opcoes
                    rotulo="Nível"
                    valor={usuario.role}
                    opcoes={niveis.map(valor => ({ valor, rotulo: NOME_DO_PAPEL[valor] }))}
                    onChange={role => { if (role !== usuario.role) void alterar({ role }, `Agora é ${NOME_DO_PAPEL[role].toLowerCase()}.`); }}
                  />
                )}
                <Alternador
                  rotulo="Pode entrar"
                  descricao="Desligado, a pessoa é desconectada na hora."
                  valor={usuario.ativo}
                  onChange={ativo => { void alterar({ ativo }, ativo ? 'Acesso liberado.' : 'Usuário bloqueado.'); }}
                />
              </Secao>
            )}

            {!souEu && usuario.role === 'MORADOR' && (
              <Secao titulo="Aparelho">
                {usuario.so_um_aparelho === undefined ? (
                  <Mensagem texto="O servidor ainda não tem a função de prender o login a um aparelho. Ela faz parte da proposta de backend que aguarda publicação." />
                ) : (
                  <>
                    <Alternador
                      rotulo="Só um aparelho"
                      descricao="O primeiro celular que entrar fica registrado e só ele consegue usar este login."
                      valor={usuario.so_um_aparelho}
                      onChange={ligado => { void alterar({ so_um_aparelho: ligado }, ligado ? 'Agora este login fica preso ao primeiro aparelho que entrar.' : 'Este login voltou a entrar em qualquer aparelho.'); }}
                    />
                    {usuario.so_um_aparelho && (
                      usuario.aparelho_em ? (
                        <>
                          <Mensagem texto={`Preso ao aparelho ${usuario.aparelho_nome ?? 'sem nome'}, desde ${formatarData(usuario.aparelho_em)}.`} tom="azul" />
                          <Botao titulo="Liberar troca de aparelho" variante="secundario" onPress={() => { void liberarAparelho(); }} carregando={salvando} />
                        </>
                      ) : (
                        <Mensagem texto="Nenhum aparelho registrado ainda. O primeiro que entrar com este login fica sendo o dele." />
                      )
                    )}
                  </>
                )}
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
          <Secao titulo="O que este morador vê">
            {vinculoIndisponivel ? (
              <Mensagem texto="O servidor ainda não tem a função de liberar postes e câmeras por morador. Ela faz parte da proposta de backend que aguarda publicação." tom="erro" />
            ) : (
              <>
                <Mensagem
                  texto={totalVisto === 0
                    ? 'Nada liberado: este morador não vê nenhuma câmera. Marque um poste inteiro ou câmeras uma a uma.'
                    : `Vê ${totalVisto} ${totalVisto === 1 ? 'câmera' : 'câmeras'}: ${postesMarcados.size} ${postesMarcados.size === 1 ? 'poste inteiro' : 'postes inteiros'} e ${camerasMarcadas.size} ${camerasMarcadas.size === 1 ? 'câmera avulsa' : 'câmeras avulsas'}.`}
                />
                <SeletorDeAcessos
                  postes={postes}
                  cameras={cameras}
                  valor={{ postes: postesMarcados, cameras: camerasMarcadas }}
                  aoMudar={novo => { setPostesMarcados(novo.postes); setCamerasMarcadas(novo.cameras); }}
                />
                <Botao titulo="Salvar o que ele vê" onPress={salvarAcessos} carregando={salvandoVinculo} />
              </>
            )}
          </Secao>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[6] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto },
  email: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave },
});
