import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import BotaoTema from '@/components/BotaoTema';
import { BarraCarregando, Entrada, Toque } from '@/components/efeitos';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { condominiosDoPainel, type CondominioDoPainel } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, raio, type Paleta } from '@/lib/tema';
import type { Condominio, Poste } from '@/lib/types';

// A busca só aparece quando a lista fica longa o bastante pra precisar dela
const MINIMO_PARA_BUSCA = 8;

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export default function PainelScreen() {
  const router = useRouter();
  const { usuario, logout } = useAuth();
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

  const totalCameras = itens.reduce((soma, i) => soma + i.totalCameras, 0);
  const primeiroNome = usuario?.nome.split(' ')[0];

  return (
    <View style={styles.tela}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.acoes}>
              <BotaoTema />
              <Pressable onPress={logout} hitSlop={espaco[3]} accessibilityRole="button">
                <Text style={styles.sair}>Sair</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <BarraCarregando ativa={carregando} />

      <FlatList
        data={carregando ? [] : visiveis}
        keyExtractor={item => String(item.id)}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={
          <View style={styles.cabecalho}>
            <Text style={styles.saudacao}>{primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}</Text>
            {!carregando && !erro && itens.length > 0 && (
              <Text style={styles.resumo}>
                Você acompanha {plural(itens.length, 'condomínio', 'condomínios')} e {plural(totalCameras, 'câmera', 'câmeras')}.
              </Text>
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
  // no navegador o cabeçalho não reserva margem à direita
  acoes: { flexDirection: 'row', alignItems: 'center', gap: espaco[2], marginRight: Platform.OS === 'web' ? 16 : 0 },
  sair: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },
  lista: { paddingHorizontal: espaco[4], paddingBottom: espaco[10], gap: espaco[3] },
  cabecalho: { paddingTop: espaco[3], paddingBottom: espaco[2], gap: espaco[1.5] },
  saudacao: { fontFamily: fontes.nome, fontSize: corpo.destaque, lineHeight: entrelinha.destaque, color: c.texto },
  resumo: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  busca: {
    backgroundColor: c.superficie, borderColor: c.linha, borderWidth: 1, borderRadius: raio.medio, marginTop: espaco[2.5],
    fontFamily: fontes.texto, fontSize: corpo.nome, color: c.texto, paddingHorizontal: espaco[3.5], paddingVertical: espaco[2.5],
  },
  cartao: { flexDirection: 'row', backgroundColor: c.superficie, borderRadius: raio.grande, overflow: 'hidden', minHeight: componentes.cartao.alturaMin },
  // o mesmo trilho azul do poste, anunciando o que vem na próxima tela
  trilho: { width: componentes.poste.trilho, backgroundColor: c.azul },
  cartaoTexto: { flex: 1, justifyContent: 'center', paddingHorizontal: espaco[4], paddingVertical: espaco[4], gap: espaco[1] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, lineHeight: entrelinha.base, color: c.texto },
  contagem: { fontFamily: fontes.texto, fontSize: corpo.base, color: c.azul },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.erro },
  vazio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, paddingTop: espaco[4] },
});
