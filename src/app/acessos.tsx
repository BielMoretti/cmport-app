import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarraCarregando } from '@/components/efeitos';
import { Mensagem } from '@/components/formulario';
import { Cabecalho, Cartao, Pilula } from '@/components/ui';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { tr } from '@/lib/idioma';
import { buscarMeusAcessos, quando, type MeuAcesso } from '@/lib/mural';
import { componentes, corpo, espaco, fontes, type Paleta } from '@/lib/tema';

/**
 * Meus acessos: cada vez que esta conta abriu uma câmera (ao vivo ou gravação). Serve para a
 * pessoa notar um acesso que não foi dela: os de outro aparelho aparecem marcados.
 */
export default function AcessosScreen() {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();

  const [acessos, setAcessos] = useState<MeuAcesso[] | null>(null);
  const [semRota, setSemRota] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const lista = await buscarMeusAcessos();
      setSemRota(lista === null);
      setAcessos(lista ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível carregar os acessos. Puxe a tela para tentar de novo.'));
    }
  }, []);

  useEffect(() => {
    void carregar().finally(() => setCarregando(false));
  }, [carregar]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const deOutroAparelho = (acessos ?? []).some(a => !a.neste_aparelho);

  return (
    <View style={styles.tela}>
      <Cabecalho titulo={tr('Meus acessos')} />
      <BarraCarregando ativa={carregando} />
      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        {erro && <Mensagem texto={erro} tom="erro" />}

        {semRota ? (
          <Mensagem texto={tr('A lista de acessos chega na próxima atualização do serviço.')} />
        ) : (
          <>
            <Mensagem texto={tr('Cada vez que a sua conta abriu uma câmera. Se aparecer um acesso que não foi seu, troque a senha em Minha conta e fale com a CM Port.')} />
            {deOutroAparelho && (
              <Mensagem texto={tr('"Outro aparelho" também aparece em acessos antigos, de antes de você trocar de celular ou reinstalar o aplicativo.')} />
            )}

            {!carregando && acessos !== null && acessos.length === 0 && !erro && (
              <Mensagem texto={tr('Nenhuma câmera aberta com esta conta ainda.')} />
            )}

            {(acessos ?? []).length > 0 && (
              <Cartao style={styles.lista}>
                {(acessos ?? []).map((a, i) => (
                  <View key={a.id} style={[styles.linha, i > 0 && styles.linhaComFio]}>
                    <View style={styles.linhaTexto}>
                      <Text style={styles.camera} numberOfLines={1}>{a.camera_nome ?? tr('Câmera {0}', [a.camera_id])}</Text>
                      {/* o que e quando primeiro: é o que a pessoa procura; o condomínio vem embaixo, se couber */}
                      <Text style={styles.detalhe} numberOfLines={1}>
                        {a.acao === 'GRAVACAO' ? tr('Gravação') : tr('Ao vivo')} · {quando(a.quando)}
                      </Text>
                      {a.condominio_nome && <Text style={styles.detalhe} numberOfLines={1}>{a.condominio_nome}</Text>}
                    </View>
                    <Pilula texto={a.neste_aparelho ? tr('Este aparelho') : tr('Outro aparelho')} tom={a.neste_aparelho ? 'azul' : 'erro'} />
                  </View>
                ))}
              </Cartao>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[4] },
  lista: { padding: 0 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin, paddingHorizontal: espaco[4], paddingVertical: espaco[2.5] },
  linhaComFio: { borderTopWidth: 1, borderTopColor: c.linha },
  linhaTexto: { flex: 1, gap: espaco[0.5] },
  camera: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto },
  detalhe: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
});
