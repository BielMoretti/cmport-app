import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { BarraCarregando } from '@/components/efeitos';
import { Alternador, Botao, Campo, confirmar, Mensagem, Opcoes, Secao } from '@/components/formulario';
import { useEstilos } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera, Poste, TipoConexaoCamera } from '@/lib/types';

/**
 * Cria uma câmera (sem `id`) ou edita uma existente (com `id`).
 *
 * Dois tipos (ver camera_model.py do cmport-system):
 * - RTMP_ISOLADA: a câmera empurra o vídeo pro servidor. O servidor gera o endereço
 *   (com a chave) que o técnico configura na câmera. É o tipo que transmite ao vivo.
 * - RTSP_NVR: canal de um gravador na rede do condomínio.
 * A API não deixa trocar o tipo nem o poste depois de criada.
 */
export default function FormularioDeCameraScreen() {
  const router = useRouter();
  const styles = useEstilos(criarEstilos);
  const params = useLocalSearchParams<{ condominioId: string; id?: string; posteId?: string }>();
  const condominioId = Number(params.condominioId);
  const cameraId = params.id ? Number(params.id) : null;
  const editando = cameraId !== null;

  const [camera, setCamera] = useState<Camera | null>(null);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [nome, setNome] = useState('');
  const [posteId, setPosteId] = useState<number | null>(params.posteId ? Number(params.posteId) : null);
  const [tipo, setTipo] = useState<TipoConexaoCamera>('RTMP_ISOLADA');
  const [nvrIp, setNvrIp] = useState('');
  const [nvrPorta, setNvrPorta] = useState('554');
  const [canal, setCanal] = useState('');
  const [nvrUsuario, setNvrUsuario] = useState('');
  const [nvrSenha, setNvrSenha] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [trocandoChave, setTrocandoChave] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function preencher(c: Camera) {
    setCamera(c);
    setNome(c.nome);
    setPosteId(c.poste_id);
    setTipo(c.tipo_conexao);
    setNvrIp(c.nvr_ip ?? '');
    setNvrPorta(String(c.nvr_porta ?? 554));
    setCanal(c.canal ? String(c.canal) : '');
    setNvrUsuario(c.nvr_usuario ?? '');
    setAtivo(c.ativo);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      api<Poste[]>(`/postes?condominio_id=${condominioId}`),
      editando ? api<Camera>(`/cameras/${cameraId}`) : Promise.resolve(null),
    ])
      .then(([p, c]) => {
        if (cancelado) return;
        setPostes(p);
        if (c) preencher(c);
      })
      .catch(e => { if (!cancelado) setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [condominioId, cameraId, editando]);

  const gravador = tipo === 'RTSP_NVR';
  const nomeValido = nome.trim().length >= 2;
  // na criação o gravador exige tudo; na edição a senha em branco significa "manter a atual"
  const gravadorValido = !gravador || (
    nvrIp.trim() !== '' && Number(canal) >= 1 && nvrUsuario.trim() !== '' && (editando || nvrSenha !== '')
  );
  const podeSalvar = nomeValido && gravadorValido && !carregando;

  async function salvar() {
    if (!podeSalvar) return;
    if (editando && camera?.ativo && !ativo) {
      const ok = await confirmar(
        'Desativar esta câmera?',
        'O servidor passa a recusar o vídeo dela: para de transmitir e de gravar. Dá para reativar depois nesta mesma tela.',
        'Desativar',
      );
      if (!ok) return;
    }
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const dadosGravador = gravador
        ? {
            canal: Number(canal),
            nvr_ip: nvrIp.trim(),
            nvr_porta: Number(nvrPorta) || 554,
            nvr_usuario: nvrUsuario.trim(),
            ...(nvrSenha !== '' ? { nvr_senha: nvrSenha } : {}),
          }
        : {};
      if (editando) {
        const c = await api<Camera>(`/cameras/${cameraId}`, { method: 'PATCH', body: { nome: nome.trim(), ativo, ...dadosGravador } });
        preencher(c);
        setNvrSenha('');
        setAviso('Alterações salvas.');
      } else {
        const c = await api<Camera>('/cameras', {
          method: 'POST',
          body: { condominio_id: condominioId, poste_id: posteId, nome: nome.trim(), tipo_conexao: tipo, ...dadosGravador },
        });
        // reabre a mesma tela já em modo de edição, mostrando o endereço gerado pelo servidor
        router.replace({ pathname: '/admin/camera', params: { condominioId: String(condominioId), id: String(c.id) } });
        return;
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function trocarChave() {
    const ok = await confirmar(
      'Gerar uma chave nova?',
      'A câmera cai na hora e só volta depois que alguém configurar o endereço novo nela, no local. Use isto se a chave atual vazou.',
      'Gerar chave nova',
    );
    if (!ok) return;
    setTrocandoChave(true);
    setErro(null);
    setAviso(null);
    try {
      const c = await api<Camera>(`/cameras/${cameraId}/rotacionar-chave`, { method: 'POST' });
      preencher(c);
      setAviso('Chave nova gerada. Configure o endereço abaixo na câmera.');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível gerar a chave. Tente de novo.');
    } finally {
      setTrocandoChave(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Stack.Screen options={{ title: editando ? 'Editar câmera' : 'Nova câmera' }} />
      <BarraCarregando ativa={carregando} />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Campo rotulo="Nome da câmera" placeholder="Ex.: Portão de pedestres" value={nome} onChangeText={setNome} maxLength={150} />

        {editando ? (
          <Mensagem
            texto={`${gravador ? 'Canal de gravador' : 'Transmite ao vivo'}, ${
              posteId === null ? 'fora de poste' : `no ${postes.find(p => p.id === posteId)?.nome ?? 'poste'}`
            }. O tipo e o poste não podem ser trocados depois de criada.`}
          />
        ) : (
          <>
            <Opcoes
              rotulo="Onde fica"
              valor={posteId}
              onChange={setPosteId}
              opcoes={[{ valor: null, rotulo: 'Fora de poste' }, ...postes.map(p => ({ valor: p.id as number | null, rotulo: p.nome }))]}
            />
            <Opcoes
              rotulo="Como ela se conecta"
              valor={tipo}
              onChange={setTipo}
              opcoes={[
                { valor: 'RTMP_ISOLADA' as TipoConexaoCamera, rotulo: 'Envia o vídeo pro servidor' },
                { valor: 'RTSP_NVR' as TipoConexaoCamera, rotulo: 'Canal de um gravador' },
              ]}
            />
            <Mensagem
              texto={gravador
                ? 'Câmera ligada a um gravador (NVR/DVR) na rede do condomínio. Ainda não transmite ao vivo pelo app.'
                : 'Ao criar, o servidor gera o endereço que o técnico configura na câmera. É o tipo que transmite ao vivo.'}
            />
          </>
        )}

        {gravador && (
          <Secao titulo="Dados do gravador">
            <Campo rotulo="Endereço IP" placeholder="Ex.: 192.168.1.50" value={nvrIp} onChangeText={setNvrIp} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
            <View style={styles.dupla}>
              <View style={styles.metade}>
                <Campo rotulo="Porta" value={nvrPorta} onChangeText={setNvrPorta} keyboardType="number-pad" />
              </View>
              <View style={styles.metade}>
                <Campo rotulo="Canal" placeholder="Ex.: 1" value={canal} onChangeText={setCanal} keyboardType="number-pad" />
              </View>
            </View>
            <Campo rotulo="Usuário" value={nvrUsuario} onChangeText={setNvrUsuario} autoCapitalize="none" autoCorrect={false} />
            <Campo
              rotulo="Senha"
              value={nvrSenha}
              onChangeText={setNvrSenha}
              secureTextEntry
              ajuda={editando ? 'Deixe em branco para manter a senha atual.' : undefined}
            />
          </Secao>
        )}

        {editando && (
          <Alternador
            rotulo="Câmera ativa"
            descricao="Desativada, ela para de transmitir e de gravar. Nada é apagado."
            valor={ativo}
            onChange={setAtivo}
          />
        )}

        {erro && <Mensagem texto={erro} tom="erro" />}
        {aviso && <Mensagem texto={aviso} tom="azul" />}

        <Botao titulo={editando ? 'Salvar alterações' : 'Criar câmera'} onPress={salvar} carregando={salvando} desabilitado={!podeSalvar} />

        {editando && camera?.tipo_conexao === 'RTMP_ISOLADA' && (
          <Secao titulo="Endereço para configurar na câmera">
            {camera.rtmp_url ? (
              <>
                <View style={styles.endereco}>
                  <Text style={styles.enderecoTexto} selectable>{camera.rtmp_url}</Text>
                </View>
                <Mensagem texto="Quem tem este endereço consegue mandar vídeo no lugar da câmera. Passe só para o técnico." />
                <Botao titulo="Enviar endereço" variante="secundario" onPress={() => { void Share.share({ message: camera.rtmp_url! }); }} />
                <Botao titulo="Gerar chave nova" variante="perigo" onPress={trocarChave} carregando={trocandoChave} />
              </>
            ) : (
              <Mensagem texto="O servidor só mostra o endereço para administradores." />
            )}
          </Secao>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { padding: espaco[4], paddingBottom: espaco[10], gap: espaco[5] },
  dupla: { flexDirection: 'row', gap: espaco[3] },
  metade: { flex: 1 },
  endereco: {
    backgroundColor: c.superficie, borderRadius: componentes.campo.raio, borderWidth: 1, borderColor: c.azul,
    padding: componentes.campo.respiroH, boxShadow: c.brilho,
  },
  enderecoTexto: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.texto },
});
