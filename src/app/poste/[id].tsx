import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Cabecalho } from '@/components/ui';
import { GlifoCamera, Horizonte, Varredura, Veu } from '@/components/arte';
import { BarraCarregando } from '@/components/efeitos';
import { Botao, formatarData, LinhaInfo, Mensagem, Secao, Selo, Total, type Tom } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ehAdministrador } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { estadoDe, ROTULO_DO_ESTADO, type Estado } from '@/lib/saude';
import { componentes, corpo, entrelinha, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import type { Camera, Poste } from '@/lib/types';

const TOM_DO_ESTADO: Record<Estado, Tom> = { online: 'azul', offline: 'erro', desconhecido: 'suave' };

/** Painel individual de um poste: o que ele tem, como está e quando foi mexido. */
export default function PainelDoPosteScreen() {
  const router = useRouter();
  const { usuario } = useAuth();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const { id } = useLocalSearchParams<{ id: string }>();
  const posteId = Number(id);
  const admin = ehAdministrador(usuario?.role);

  const [poste, setPoste] = useState<Poste | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [p, c] = await Promise.all([
        api<Poste>(`/postes/${posteId}`),
        api<Camera[]>(`/cameras/por-poste/${posteId}`),
      ]);
      setPoste(p);
      setCameras(c);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar este poste. Puxe a tela para tentar de novo.');
    }
  }, [posteId]);

  useFocusEffect(useCallback(() => {
    if (!Number.isInteger(posteId)) {
      setErro('Poste inválido.');
      setCarregando(false);
      return;
    }
    carregar().finally(() => setCarregando(false));
  }, [carregar, posteId]));

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const conhecidos = cameras.filter(c => estadoDe(c) !== 'desconhecido');
  const online = conhecidos.filter(c => estadoDe(c) === 'online').length;
  const aoVivo = cameras.filter(c => c.tipo_conexao === 'RTMP_ISOLADA').length;

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={styles.conteudo}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
    >
      <Cabecalho titulo={'Poste'} />
      <BarraCarregando ativa={carregando} />

      {/* mesma silhueta do condomínio a que o poste pertence */}
      <View style={styles.faixa}>
        {poste && <Horizonte semente={poste.condominio_id} style={StyleSheet.absoluteFill} />}
        <Varredura altura={componentes.faixa.altura} />
        <Veu cor={cores.veu} inicio={0.3} />
        <View style={styles.faixaTexto}>
          <Text style={styles.nome} numberOfLines={2}>{poste?.nome ?? ' '}</Text>
          {poste?.condominio_nome && <Text style={styles.condominio} numberOfLines={1}>{poste.condominio_nome}</Text>}
        </View>
      </View>

      <View style={styles.corpo}>
        {erro && <Mensagem texto={erro} tom="erro" />}

        {poste && (
          <>
            <View style={styles.totais}>
              <Total valor={String(cameras.length)} legenda={cameras.length === 1 ? 'câmera' : 'câmeras'} />
              <Total valor={conhecidos.length > 0 ? `${online}/${conhecidos.length}` : '–'} legenda="online" />
              <Total valor={String(aoVivo)} legenda="ao vivo no app" />
            </View>

            <Secao titulo="Sobre este poste">
              <View>
                <LinhaInfo rotulo="Situação" valor={poste.ativo ? 'Ativo' : 'Desativado'} />
                <LinhaInfo rotulo="Instalado em" valor={formatarData(poste.criado_em)} />
                <LinhaInfo rotulo="Última alteração" valor={formatarData(poste.atualizado_em)} />
                <LinhaInfo rotulo="Observação" valor={poste.observacao ?? 'Nenhuma'} />
              </View>
            </Secao>

            <Secao titulo="Câmeras">
              {cameras.length === 0 ? (
                <Mensagem texto="Este poste ainda não tem câmera cadastrada." />
              ) : (
                <View>
                  {cameras.map(c => {
                    const estado = estadoDe(c);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => router.push({ pathname: '/camera/[id]', params: { id: String(c.id) } })}
                        accessibilityRole="button"
                        accessibilityLabel={`Abrir a câmera ${c.nome}`}
                        style={({ pressed }) => [styles.camera, pressed && styles.cameraPressionada]}
                      >
                        <GlifoCamera cor={cores.azul} />
                        <View style={styles.cameraTexto}>
                          <Text style={styles.cameraNome} numberOfLines={1}>{c.nome}</Text>
                          <Text style={styles.cameraTipo}>
                            {c.tipo_conexao === 'RTMP_ISOLADA' ? 'Transmite ao vivo' : `Gravador, canal ${c.canal ?? '?'}`}
                          </Text>
                        </View>
                        <Selo texto={ROTULO_DO_ESTADO[estado]} tom={TOM_DO_ESTADO[estado]} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Secao>

            {admin && (
              <Secao titulo="Administração">
                <Botao
                  titulo="Editar este poste"
                  variante="secundario"
                  onPress={() => router.push({
                    pathname: '/admin/poste',
                    params: { condominioId: String(poste.condominio_id), id: String(poste.id) },
                  })}
                />
                <Botao
                  titulo="Adicionar câmera neste poste"
                  variante="secundario"
                  onPress={() => router.push({
                    pathname: '/admin/camera',
                    params: { condominioId: String(poste.condominio_id), posteId: String(poste.id) },
                  })}
                />
              </Secao>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', paddingBottom: espaco[10] },
  faixa: {
    height: componentes.faixa.altura, justifyContent: 'flex-end', overflow: 'hidden', marginHorizontal: espaco[5],
    borderRadius: raio.grande, backgroundColor: c.superficie, borderWidth: 1, borderColor: c.linha, boxShadow: c.brilho,
  },
  faixaTexto: { paddingHorizontal: espaco[4], paddingBottom: espaco[2], gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.destaque, lineHeight: entrelinha.destaque, color: c.texto },
  condominio: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave },
  corpo: { paddingHorizontal: espaco[5], paddingTop: espaco[4], gap: espaco[6] },
  totais: { flexDirection: 'row', gap: espaco[2] },
  camera: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin,
    paddingVertical: espaco[3], borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  cameraPressionada: { backgroundColor: c.azulSuave },
  cameraTexto: { flex: 1, gap: espaco[0.5] },
  cameraNome: { fontFamily: fontes.textoForte, fontSize: corpo.nome, color: c.texto },
  cameraTipo: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
});
