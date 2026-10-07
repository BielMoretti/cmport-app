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
import { componentes, corpo, entrelinha, espaco, fontes, vidro, type Paleta } from '@/lib/tema';
import type { Camera, Poste, Role, Usuario } from '@/lib/types';

/**
 * Ficha de um usuário: nome, nível, bloqueio, senha nova e — para o MORADOR — o que
 * ele enxerga: postes inteiros e câmeras liberadas uma a uma.
 *
 * As rotas /usuarios/{id}/acessos fazem parte da proposta de backend
 * (cmport-backend-proposta). Enquanto não forem publicadas, respondem 404 e a tela avisa.
 */

/** Um condomínio na lista de liberação: os postes dele (com as câmeras) e as câmeras fora de poste. */
interface Grupo {
  condominioId: number;
  nome: string;
  postes: { poste: Poste; cameras: Camera[] }[];
  avulsas: Camera[];
}
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

  // tudo agrupado por condomínio: os postes com as câmeras de cada um e, por último, as câmeras fora de poste
  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<number, Grupo>();
    const grupo = (id: number, nomeDoCondominio: string | null) => {
      if (!mapa.has(id)) mapa.set(id, { condominioId: id, nome: nomeDoCondominio ?? `Condomínio ${id}`, postes: [], avulsas: [] });
      return mapa.get(id)!;
    };
    const idsDePoste = new Set(postes.map(p => p.id));
    for (const p of postes) grupo(p.condominio_id, p.condominio_nome).postes.push({ poste: p, cameras: cameras.filter(c => c.poste_id === p.id) });
    for (const c of cameras) if (c.poste_id === null || !idsDePoste.has(c.poste_id)) grupo(c.condominio_id, c.condominio_nome).avulsas.push(c);
    const termo = busca.trim().toUpperCase();
    const bate = (texto: string) => texto.toUpperCase().includes(termo);
    const temMarca = (g: Grupo) => g.postes.some(x => postesMarcados.has(x.poste.id) || x.cameras.some(c => camerasMarcadas.has(c.id))) || g.avulsas.some(c => camerasMarcadas.has(c.id));
    return [...mapa.values()]
      // a busca vale para o nome do condomínio, do poste ou da câmera
      .filter(g => !termo || bate(g.nome) || g.postes.some(x => bate(x.poste.nome) || x.cameras.some(c => bate(c.nome))) || g.avulsas.some(c => bate(c.nome)))
      // quem já tem algo liberado primeiro, pra a pessoa ver de cara
      .sort((a, b) => Number(temMarca(b)) - Number(temMarca(a)) || a.nome.localeCompare(b.nome));
  }, [postes, cameras, busca, postesMarcados, camerasMarcadas]);

  // quantas câmeras o morador vê de fato: as dos postes marcados mais as marcadas uma a uma
  const totalVisto = cameras.filter(c => camerasMarcadas.has(c.id) || (c.poste_id !== null && postesMarcados.has(c.poste_id))).length;

  const alternarPoste = (posteId: number) => {
    const marcar = !postesMarcados.has(posteId);
    setPostesMarcados(atual => { const novo = new Set(atual); if (marcar) novo.add(posteId); else novo.delete(posteId); return novo; });
    // poste inteiro liberado: as marcas das câmeras dele uma a uma ficam sobrando
    if (marcar) setCamerasMarcadas(atual => new Set([...atual].filter(id => cameras.find(c => c.id === id)?.poste_id !== posteId)));
  };
  const alternarCamera = (cameraId: number) => setCamerasMarcadas(atual => {
    const novo = new Set(atual);
    if (novo.has(cameraId)) novo.delete(cameraId); else novo.add(cameraId);
    return novo;
  });

  const caixa = (marcado: boolean, apagada = false) => (
    <View style={[styles.caixa, marcado && styles.caixaMarcada, apagada && styles.caixaApagada]}>
      {marcado && <View style={styles.caixaMiolo} />}
    </View>
  );

  const linhaDeCamera = (c: Camera, peloPoste: boolean) => {
    const marcada = peloPoste || camerasMarcadas.has(c.id);
    return (
      <Pressable
        key={`c${c.id}`}
        onPress={() => alternarCamera(c.id)}
        disabled={peloPoste}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcada, disabled: peloPoste }}
        accessibilityLabel={`Câmera ${c.nome}${peloPoste ? ', liberada pelo poste' : ''}`}
        style={({ pressed }) => [styles.linha, styles.linhaDeCamera, pressed && styles.linhaPressionada]}
      >
        {caixa(marcada, peloPoste)}
        <Text style={[styles.linhaNome, marcada && styles.linhaNomeMarcado]} numberOfLines={2}>{c.nome}</Text>
        {peloPoste && <Text style={styles.nota}>pelo poste</Text>}
      </Pressable>
    );
  };

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
                <Campo rotulo="Buscar" placeholder="Condomínio, poste ou câmera" autoCorrect={false} value={busca} onChangeText={setBusca} />

                {grupos.length === 0 && <Mensagem texto={busca.trim() ? 'Nada encontrado com esse nome.' : 'Ainda não há poste nem câmera cadastrados.'} />}

                {grupos.slice(0, 20).map(g => (
                  <View key={g.condominioId} style={styles.grupo}>
                    <Text style={styles.grupoNome} accessibilityRole="header">{g.nome}</Text>
                    {g.postes.map(({ poste, cameras: doPoste }) => {
                      const inteiro = postesMarcados.has(poste.id);
                      return (
                        <View key={`p${poste.id}`}>
                          <Pressable
                            onPress={() => alternarPoste(poste.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: inteiro }}
                            accessibilityLabel={`Poste inteiro: ${poste.nome}, ${doPoste.length} ${doPoste.length === 1 ? 'câmera' : 'câmeras'}`}
                            style={({ pressed }) => [styles.linha, pressed && styles.linhaPressionada]}
                          >
                            {caixa(inteiro)}
                            <View style={styles.linhaTexto}>
                              <Text style={[styles.linhaNome, styles.posteNome, inteiro && styles.linhaNomeMarcado]} numberOfLines={2}>{poste.nome}</Text>
                              <Text style={styles.nota}>Poste inteiro, {doPoste.length} {doPoste.length === 1 ? 'câmera' : 'câmeras'}</Text>
                            </View>
                          </Pressable>
                          {doPoste.map(c => linhaDeCamera(c, inteiro))}
                        </View>
                      );
                    })}
                    {g.avulsas.length > 0 && (
                      <View>
                        <Text style={styles.subtitulo}>Fora de poste</Text>
                        {g.avulsas.map(c => linhaDeCamera(c, false))}
                      </View>
                    )}
                  </View>
                ))}
                {grupos.length > 20 && <Mensagem texto={`Mostrando 20 de ${grupos.length} condomínios. Use a busca para achar os outros.`} />}
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
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.alvoDeToque + espaco[1],
    paddingVertical: espaco[2], borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  linhaPressionada: { backgroundColor: c.azulSuave },
  linhaDeCamera: { paddingLeft: espaco[8] },
  linhaTexto: { flex: 1, gap: espaco[0.5] },
  posteNome: { flex: 0, fontFamily: fontes.textoForte, color: c.texto },
  nota: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
  grupo: { ...vidro(c), borderRadius: componentes.cartao.raio, paddingHorizontal: espaco[4], paddingTop: espaco[3.5], paddingBottom: espaco[1] },
  grupoNome: { fontFamily: fontes.nome, fontSize: corpo.nome, lineHeight: entrelinha.base, color: c.texto, marginBottom: espaco[1] },
  subtitulo: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave, marginTop: espaco[3] },
  caixaApagada: { opacity: 0.45 },
  caixa: {
    width: componentes.caixaDeMarcar, height: componentes.caixaDeMarcar, borderRadius: espaco[1.5],
    borderWidth: 2, borderColor: c.textoSuave, alignItems: 'center', justifyContent: 'center',
  },
  caixaMarcada: { borderColor: c.luz, backgroundColor: c.luz, boxShadow: c.brilho },
  caixaMiolo: { width: componentes.caixaDeMarcar / 2.4, height: componentes.caixaDeMarcar / 2.4, borderRadius: espaco[0.5], backgroundColor: c.sobreLuz },
  linhaNome: { flex: 1, fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  linhaNomeMarcado: { fontFamily: fontes.textoForte, color: c.texto },
});
