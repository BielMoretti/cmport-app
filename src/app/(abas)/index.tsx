import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Contador, Horizonte, Varredura, Veu } from '@/components/arte';
import { BarraCarregando, Entrada, Toque } from '@/components/efeitos';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { condominiosDoPainel, type CondominioDoPainel } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Condominio, Poste } from '@/lib/types';

// A busca só aparece quando a lista fica longa o bastante pra precisar dela
const MINIMO_PARA_BUSCA = 8;
// Semente do desenho do topo do painel (qualquer número fixo — só precisa ser sempre o mesmo)
const SEMENTE_DO_PAINEL = 7;

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export default function PainelScreen() {
  const router = useRouter();
  const { usuario } = useAuth();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const [itens, setItens] = useState<CondominioDoPainel[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [condominios, postes] = await Promise.all([
        api<Condominio[]>('/condominios?tipo=CONDOMINIO&ativo=true&limit=700'),
        api<Poste[]>('/postes'),
      ]);
      setItens(condominiosDoPainel(condominios, postes));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o painel. Puxe a tela para tentar de novo.');
    }
  }, []);

  useEffect(() => {
    carregar().finally(() => setCarregando(false));
  }, [carregar]);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return termo ? itens.filter(i => i.nome.toUpperCase().includes(termo)) : itens;
  }, [itens, busca]);

  const totalPostes = itens.reduce((soma, i) => soma + i.totalPostes, 0);
  const totalCameras = itens.reduce((soma, i) => soma + i.totalCameras, 0);
  const primeiroNome = usuario?.nome.split(' ')[0];

  return (
    <View style={styles.tela}>
      <BarraCarregando ativa={carregando} />

      <FlatList
        data={carregando ? [] : visiveis}
        keyExtractor={item => String(item.id)}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          <View style={styles.cabecalho}>
            {/* Abertura do painel: a cidade à noite, varrida por um feixe de luz */}
            <View style={styles.heroi}>
              <Horizonte semente={SEMENTE_DO_PAINEL} style={StyleSheet.absoluteFill} />
              <Varredura altura={componentes.heroi.altura} />
              <Veu cor={cores.superficie} inicio={0.42} />
              <View style={styles.heroiTexto}>
                <Text style={styles.saudacao}>{primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}</Text>
                <Text style={styles.resumo}>Suas câmeras, ao vivo e gravadas, num só lugar.</Text>
              </View>
            </View>

            {!carregando && !erro && itens.length > 0 && (
              <View style={styles.numeros}>
                <View style={styles.numero}>
                  <Contador valor={itens.length} style={styles.numeroValor} />
                  <Text style={styles.numeroRotulo}>{itens.length === 1 ? 'condomínio' : 'condomínios'}</Text>
                </View>
                <View style={styles.numero}>
                  <Contador valor={totalPostes} style={styles.numeroValor} />
                  <Text style={styles.numeroRotulo}>{totalPostes === 1 ? 'poste' : 'postes'}</Text>
                </View>
                <View style={styles.numero}>
                  <Contador valor={totalCameras} style={styles.numeroValor} />
                  <Text style={styles.numeroRotulo}>{totalCameras === 1 ? 'câmera' : 'câmeras'}</Text>
                </View>
              </View>
            )}

            {erro && <Text style={styles.erro} accessibilityRole="alert">{erro}</Text>}
            {itens.length >= MINIMO_PARA_BUSCA && (
              <TextInput
                style={styles.busca}
                placeholder="Buscar pelo nome"
                placeholderTextColor={cores.textoSuave}
                autoCorrect={false}
                value={busca}
                onChangeText={setBusca}
                accessibilityLabel="Buscar condomínio pelo nome"
              />
            )}
          </View>
        }
        ListEmptyComponent={
          !carregando && !erro ? (
            <Text style={styles.vazio}>
              {busca.trim()
                ? `Nenhum condomínio com "${busca.trim()}" no nome.`
                : 'Nenhum condomínio liberado para você ainda. Fale com a CM Port para pedir acesso.'}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Entrada ordem={index}>
            <Toque
              brilho
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${item.nome}`}
              onPress={() => router.push({ pathname: '/condominio/[id]', params: { id: String(item.id), nome: item.nome } })}
              style={styles.cartao}
            >
              {/* Cada condomínio tem a sua silhueta, gerada a partir do id */}
              <Horizonte semente={item.id} style={styles.miniatura} />
              <Veu cor={cores.superficie} direcao="esquerda" style={styles.miniatura} />
              <View style={styles.trilho} />
              <View style={styles.cartaoTexto}>
                <Text style={styles.nome} numberOfLines={2}>{item.nome}</Text>
                <Text style={styles.contagem}>
                  {plural(item.totalPostes, 'poste', 'postes')}, {plural(item.totalCameras, 'câmera', 'câmeras')}
                </Text>
              </View>
            </Toque>
          </Entrada>
        )}
      />
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  lista: { paddingHorizontal: espaco[4], paddingBottom: espaco[10], gap: espaco[3] },
  cabecalho: { paddingTop: espaco[2], paddingBottom: espaco[2], gap: espaco[4] },

  heroi: {
    height: componentes.heroi.altura, borderRadius: componentes.heroi.raio, overflow: 'hidden',
    backgroundColor: c.superficie, borderWidth: 1, borderColor: c.linha, boxShadow: c.brilho, justifyContent: 'flex-end',
  },
  heroiTexto: { padding: espaco[4], gap: espaco[1] },
  saudacao: { fontFamily: fontes.nome, fontSize: corpo.destaque, lineHeight: entrelinha.destaque, color: c.texto },
  resumo: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },

  numeros: { flexDirection: 'row', gap: espaco[3] },
  numero: {
    flex: 1, backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha,
    paddingVertical: espaco[3], alignItems: 'center',
  },
  numeroValor: { fontFamily: fontes.nome, fontSize: componentes.estatistica.numero, color: c.azul },
  numeroRotulo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },

  busca: {
    backgroundColor: c.superficie, borderColor: c.linha, borderWidth: 1, borderRadius: componentes.campo.raio,
    fontFamily: fontes.texto, fontSize: corpo.nome, color: c.texto,
    paddingHorizontal: componentes.campo.respiroH, paddingVertical: espaco[2.5],
  },

  cartao: {
    flexDirection: 'row', backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, overflow: 'hidden',
    minHeight: componentes.cartao.alturaMin, borderWidth: 1, borderColor: c.linha,
  },
  miniatura: { position: 'absolute', top: 0, bottom: 0, right: 0, left: undefined, width: componentes.cartao.miniatura },
  // o mesmo trilho azul do poste, anunciando o que vem na próxima tela
  trilho: { width: componentes.poste.trilho, backgroundColor: c.luz, boxShadow: c.brilho },
  cartaoTexto: {
    flex: 1, justifyContent: 'center', paddingLeft: componentes.cartao.respiro, paddingVertical: componentes.cartao.respiro,
    paddingRight: componentes.cartao.miniatura / 2, gap: espaco[1],
  },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, lineHeight: entrelinha.base, color: c.texto },
  contagem: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.azul },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.erro },
  vazio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, paddingTop: espaco[4] },
});
