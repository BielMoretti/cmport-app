import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Cabecalho } from '@/components/ui';
import { BarraCarregando } from '@/components/efeitos';
import { Botao, Campo, confirmar, formatarData, LinhaInfo, Mensagem, Secao } from '@/components/formulario';
import SeletorDeAcessos, { camerasAlcancadas } from '@/components/SeletorDeAcessos';
import { useEstilos } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { formatarTelefone } from '@/lib/perfil';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import { localDoUsuario, type Camera, type Poste, type Usuario } from '@/lib/types';

/** O bloco e apartamento de um morador, venha ele solto ou dentro de `locais`. */
const unidadeDe = (u: Usuario) => u.unidade ?? u.locais?.[0]?.unidade ?? '';

/**
 * Ficha de um morador, vista pelo síndico. Segue o que o serviço de cliente aceita
 * (PATCH /usuarios/{id}: telefone, unidade e ativo):
 *
 * - bloco e apartamento e telefone: o síndico altera;
 * - nome, CPF e e-mail: não mudam por aqui (o nome e o CPF identificam a pessoa);
 * - senha: a conta nasce com a senha que o síndico definiu no cadastro e a pessoa é obrigada a
 *   trocar no primeiro acesso; quem redefine depois é a CM Port, pelo painel;
 * - aparelho: o síndico vê em qual celular a conta está presa; quem libera a troca é a CM Port;
 * - "tirar do condomínio" (ativo: false) encerra as liberações; nada é apagado.
 */
export default function FichaDoMoradorScreen() {
  const router = useRouter();
  const styles = useEstilos(criarEstilos);
  const { id } = useLocalSearchParams<{ id: string }>();
  const usuarioId = Number(id);

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [unidade, setUnidade] = useState('');
  const [telefone, setTelefone] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // o que o morador vê: postes inteiros e câmeras uma a uma
  const [postes, setPostes] = useState<Poste[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [postesMarcados, setPostesMarcados] = useState<Set<number>>(new Set());
  const [camerasMarcadas, setCamerasMarcadas] = useState<Set<number>>(new Set());
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  const receber = useCallback((u: Usuario) => {
    setUsuario(u);
    setUnidade(unidadeDe(u));
    setTelefone((u.telefone ?? '').replace(/\D/g, ''));
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const u = await api<Usuario>(`/usuarios/${usuarioId}`);
        if (cancelado) return;
        receber(u);
        if (u.role === 'MORADOR') {
          const [listaPostes, listaCameras, acessos] = await Promise.all([
            api<Poste[]>('/postes'),
            api<Camera[]>('/cameras'),
            api<{ poste_ids: number[]; camera_ids: number[] }>(`/usuarios/${usuarioId}/acessos`),
          ]);
          if (cancelado) return;
          // o síndico pode ter vários condomínios: a ficha mostra só os postes e câmeras do condomínio deste morador
          const doMorador = localDoUsuario(u)?.id ?? null;
          setPostes(doMorador === null ? listaPostes : listaPostes.filter(p => p.condominio_id === doMorador));
          setCameras(doMorador === null ? listaCameras : listaCameras.filter(c => c.condominio_id === doMorador));
          setPostesMarcados(new Set(acessos.poste_ids));
          setCamerasMarcadas(new Set(acessos.camera_ids));
        }
      } catch (e) {
        if (!cancelado) setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o morador.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [usuarioId, receber]);

  async function alterar(mudanca: { unidade?: string; telefone?: string | null }, feito: string) {
    if (!usuario) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      receber(await api<Usuario>(`/usuarios/${usuario.id}`, { method: 'PATCH', body: mudanca }));
      setAviso(feito);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function tirarDoCondominio() {
    if (!usuario) return;
    const local = localDoUsuario(usuario)?.nome ?? 'condomínio';
    const ok = await confirmar(
      'Tirar este morador?',
      `${usuario.nome} deixa de ver as câmeras de ${local} na hora, e as liberações dele são encerradas. A conta e o histórico não são apagados. Para voltar, é preciso cadastrá-lo de novo.`,
      'Tirar',
    );
    if (!ok) return;
    setSalvando(true);
    setErro(null);
    try {
      await api(`/usuarios/${usuario.id}`, { method: 'PATCH', body: { ativo: false } });
      router.back();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível tirar o morador. Tente de novo.');
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
  // síndico só é alterado pela CM Port
  const morador = usuario?.role === 'MORADOR';
  const telefoneAtual = (usuario?.telefone ?? '').replace(/\D/g, '');
  const telefoneRuim = telefone.length > 0 && (telefone.length < 10 || telefone.length > 13);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={'Morador'} />
      <BarraCarregando ativa={carregando} />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {usuario && (
          <View>
            <Text style={styles.titulo}>{usuario.nome}</Text>
            <Text style={styles.email}>{[localDoUsuario(usuario)?.nome, unidadeDe(usuario), usuario.email].filter(Boolean).join(' · ')}</Text>
          </View>
        )}
        {erro && <Mensagem texto={erro} tom="erro" />}
        {aviso && <Mensagem texto={aviso} tom="azul" />}

        {usuario && !morador && (
          <Mensagem texto="Esta pessoa é síndico. Síndico só é alterado pela CM Port." />
        )}
        {usuario && morador && usuario.precisa_trocar_senha && (
          <Mensagem texto="Ainda não fez o primeiro acesso: entra com a senha inicial que foi definida no cadastro, e o app pede que crie a própria. A senha inicial vale 7 dias." />
        )}

        {usuario && morador && (
          <>
            <Secao titulo="Dados">
              <LinhaInfo rotulo="Nome" valor={usuario.nome} />
              {usuario.cpf_mascarado ? <LinhaInfo rotulo="CPF" valor={usuario.cpf_mascarado} /> : null}
              <LinhaInfo rotulo="Email" valor={usuario.email} />
              <Mensagem texto="Nome, CPF e email identificam a pessoa e não mudam pelo aplicativo. Se houver erro no cadastro, fale com a CM Port." />

              <Campo rotulo="Bloco e apartamento" value={unidade} onChangeText={setUnidade} maxLength={50} placeholder="Bloco B, apto 42" ajuda="O morador vê esta informação, mas não consegue alterar." />
              <Botao
                titulo="Salvar bloco e apartamento"
                variante="secundario"
                onPress={() => { void alterar({ unidade: unidade.trim() }, 'Bloco e apartamento salvos.'); }}
                carregando={salvando}
                desabilitado={unidade.trim().length === 0 || unidade.trim() === unidadeDe(usuario)}
              />

              <Campo
                rotulo="Telefone (WhatsApp)" value={formatarTelefone(telefone)} onChangeText={t => setTelefone(t.replace(/\D/g, '').slice(0, 13))}
                keyboardType="phone-pad" ajuda={telefoneRuim ? 'O telefone precisa ter de 10 a 13 dígitos, com o DDD.' : 'Opcional.'}
              />
              <Botao
                titulo="Salvar telefone"
                variante="secundario"
                onPress={() => { void alterar({ telefone: telefone || null }, telefone ? 'Telefone salvo.' : 'Telefone apagado.'); }}
                carregando={salvando}
                desabilitado={telefoneRuim || telefone === telefoneAtual}
              />
            </Secao>

            <Secao titulo="O que este morador vê">
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
            </Secao>

            <Secao titulo="Aparelho">
              {/* trocar de aparelho é com a CM Port: o síndico vê em qual celular a conta está, mas não libera */}
              {usuario.aparelho_em ? (
                <Mensagem texto={`A conta está presa ao aparelho ${usuario.aparelho_nome ?? 'sem nome'}, desde ${formatarData(usuario.aparelho_em)}. Só ele consegue entrar. Se o morador trocou de celular, quem libera a troca é a CM Port.`} tom="azul" />
              ) : (
                <Mensagem texto="Nenhum aparelho registrado ainda. O primeiro celular que entrar com este login fica sendo o dele, e só ele consegue usar." />
              )}
            </Secao>

            <Secao titulo="Senha">
              <Mensagem texto="O morador entra pela primeira vez com a senha que você definiu no cadastro e cria a própria em seguida. Se ele esquecer a senha, quem redefine é a CM Port." />
            </Secao>

            <Secao titulo="Tirar do condomínio">
              <Mensagem texto="Use quando a pessoa se mudou ou não deve mais ver as câmeras. O acesso é encerrado na hora; nada é apagado." />
              <Botao titulo="Tirar este morador" variante="secundario" onPress={() => { void tirarDoCondominio(); }} carregando={salvando} />
            </Secao>
          </>
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
