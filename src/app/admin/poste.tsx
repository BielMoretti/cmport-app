import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Cabecalho } from '@/components/ui';
import { BarraCarregando } from '@/components/efeitos';
import { Alternador, Botao, Campo, confirmar, Mensagem } from '@/components/formulario';
import { useEstilos } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { componentes, espaco, type Paleta } from '@/lib/tema';
import type { Poste } from '@/lib/types';

/** Cria um poste (sem `id`) ou edita um existente (com `id`). */
export default function FormularioDePosteScreen() {
  const router = useRouter();
  const styles = useEstilos(criarEstilos);
  const params = useLocalSearchParams<{ condominioId: string; id?: string }>();
  const condominioId = Number(params.condominioId);
  const posteId = params.id ? Number(params.id) : null;
  const editando = posteId !== null;

  const [nome, setNome] = useState('');
  const [observacao, setObservacao] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [ativoOriginal, setAtivoOriginal] = useState(true);
  const [totalCameras, setTotalCameras] = useState(0);
  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!editando) return;
    api<Poste>(`/postes/${posteId}`)
      .then(p => {
        setNome(p.nome);
        setObservacao(p.observacao ?? '');
        setAtivo(p.ativo);
        setAtivoOriginal(p.ativo);
        setTotalCameras(p.total_cameras);
      })
      .catch(e => setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o poste.'))
      .finally(() => setCarregando(false));
  }, [editando, posteId]);

  const nomeValido = nome.trim().length >= 2;

  async function salvar() {
    if (!nomeValido) return;
    if (editando && ativoOriginal && !ativo) {
      const ok = await confirmar(
        'Desativar este poste?',
        totalCameras > 0
          ? `Ele some do painel dos moradores. As ${totalCameras} câmeras dele continuam cadastradas e gravando; para parar uma câmera, desative a câmera.`
          : 'Ele some do painel dos moradores. Dá para reativar depois nesta mesma tela.',
        'Desativar',
      );
      if (!ok) return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const corpo = { nome: nome.trim(), observacao: observacao.trim() || null };
      if (editando) {
        await api(`/postes/${posteId}`, { method: 'PATCH', body: { ...corpo, ativo } });
      } else {
        await api('/postes', { method: 'POST', body: { ...corpo, condominio_id: condominioId } });
      }
      router.back();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.tela}>
      <Cabecalho titulo={editando ? 'Editar poste' : 'Novo poste'} />
      <BarraCarregando ativa={carregando} />

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Campo
          rotulo="Nome do poste"
          placeholder="Ex.: Poste da portaria"
          value={nome}
          onChangeText={setNome}
          maxLength={150}
          ajuda="Como os moradores vão ver. Pelo menos 2 letras."
        />
        <Campo
          rotulo="Observação"
          placeholder="Ex.: em frente ao portão de pedestres"
          value={observacao}
          onChangeText={setObservacao}
          multiline
          ajuda="Opcional. Ajuda a equipe a achar o poste no local."
        />

        {editando && (
          <Alternador
            rotulo="Poste ativo"
            descricao="Desativado, ele some do painel dos moradores. Nada é apagado."
            valor={ativo}
            onChange={setAtivo}
          />
        )}

        {erro && <Mensagem texto={erro} tom="erro" />}

        <Botao
          titulo={editando ? 'Salvar alterações' : 'Criar poste'}
          onPress={salvar}
          carregando={salvando}
          desabilitado={!nomeValido || carregando}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[5] },
});
