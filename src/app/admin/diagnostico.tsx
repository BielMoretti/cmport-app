import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Cabecalho } from '@/components/ui';
import { FaixaDeEstado, Medidor } from '@/components/central';
import { BarraCarregando } from '@/components/efeitos';
import { Mensagem, Opcoes, Selo, type Tom } from '@/components/formulario';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { api, ApiError } from '@/lib/api';
import { buscarUsoDeDisco, type UsoDeDisco } from '@/lib/gravacoes';
import { estadoDe, ROTULO_DA_SAUDE, ROTULO_DO_ESTADO, type Estado } from '@/lib/saude';
import { componentes, corpo, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera } from '@/lib/types';

const TOM_DO_ESTADO: Record<Estado, Tom> = { online: 'azul', offline: 'erro', desconhecido: 'suave' };
type Filtro = 'todas' | 'problemas';

const emGb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;

/**
 * Diagnóstico: todas as câmeras numa lista técnica — conexão, qualidade do vídeo,
 * plano de gravação e quanto do espaço de gravação cada uma está usando.
 */
export default function DiagnosticoScreen() {
  const router = useRouter();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [uso, setUso] = useState<Map<number, UsoDeDisco>>(new Map());
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const lista = await api<Camera[]>('/cameras?incluir_inativas=true');
      setCameras(lista);
      setErro(null);
      // o uso de disco vem câmera a câmera; chega depois, sem travar a lista
      const mapa = new Map<number, UsoDeDisco>();
      for (let i = 0; i < lista.length; i += 4) {
        const lote = lista.slice(i, i + 4).filter(c => c.ativo);
        const usos = await Promise.all(lote.map(c => buscarUsoDeDisco(c.id).catch(() => null)));
        lote.forEach((c, j) => { if (usos[j]) mapa.set(c.id, usos[j]!); });
        setUso(new Map(mapa));
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o diagnóstico. Puxe a tela para tentar de novo.');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]));

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const comProblema = (c: Camera) => c.ativo && (estadoDe(c) === 'offline' || c.saude === 'PROBLEMA' || c.saude === 'ATENCAO');
  const ativas = useMemo(() => cameras.filter(c => c.ativo), [cameras]);
  const visiveis = filtro === 'problemas' ? cameras.filter(comProblema) : cameras;
  const totalUsado = [...uso.values()].reduce((s, u) => s + u.usado, 0);

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={styles.conteudo}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
    >
      <Cabecalho titulo={'Diagnóstico'} />
      <BarraCarregando ativa={carregando} />

      {erro && <Mensagem texto={erro} tom="erro" />}

      {ativas.length > 0 && (
        <>
          <FaixaDeEstado cameras={ativas} />
          {uso.size > 0 && (
            <Mensagem texto={`As câmeras consultadas ocupam ${emGb(totalUsado)} de gravação no servidor.`} />
          )}
          <Opcoes
            rotulo="Mostrar"
            valor={filtro}
            onChange={setFiltro}
            opcoes={[{ valor: 'todas' as Filtro, rotulo: `Todas (${cameras.length})` }, { valor: 'problemas' as Filtro, rotulo: `Com problema (${cameras.filter(comProblema).length})` }]}
          />
        </>
      )}

      {!carregando && !erro && visiveis.length === 0 && (
        <Mensagem texto={filtro === 'problemas' ? 'Nenhuma câmera com problema agora.' : 'Nenhuma câmera cadastrada.'} />
      )}

      {visiveis.map(c => {
        const estado = estadoDe(c);
        const u = uso.get(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: '/camera/[id]', params: { id: String(c.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`Abrir a câmera ${c.nome}`}
            style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}
          >
            <View style={styles.cabeca}>
              <View style={styles.cabecaTexto}>
                <Text style={[styles.nome, !c.ativo && styles.apagado]} numberOfLines={1}>{c.nome}</Text>
                <Text style={styles.local} numberOfLines={1}>
                  {[c.condominio_nome, c.poste_nome ?? 'fora de poste'].filter(Boolean).join(', ')}
                </Text>
              </View>
              {c.ativo ? <Selo texto={ROTULO_DO_ESTADO[estado]} tom={TOM_DO_ESTADO[estado]} /> : <Selo texto="Desativada" />}
            </View>

            {c.ativo && (
              <>
                <Text style={styles.detalhe}>
                  {c.saude ? ROTULO_DA_SAUDE[c.saude] : 'Qualidade ainda não medida'}. Gravação guardada por {c.dias_retencao} dias
                  {c.corrigir_tempo ? ', com correção de horário' : ''}.
                </Text>
                {u ? (
                  <Medidor fracao={u.limite > 0 ? u.usado / u.limite : 0} rotulo={`${emGb(u.usado)} de ${emGb(u.limite)} no servidor`} />
                ) : (
                  <Text style={styles.detalhe}>Consultando o espaço de gravação…</Text>
                )}
              </>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center', padding: espaco[4], paddingBottom: espaco[10], gap: espaco[4] },
  cartao: {
    backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha,
    padding: espaco[4], gap: espaco[3],
  },
  cartaoPressionado: { borderColor: c.azul, boxShadow: c.brilho },
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: espaco[3] },
  cabecaTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  apagado: { color: c.textoSuave },
  local: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
  detalhe: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
});
