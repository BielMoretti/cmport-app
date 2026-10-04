import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { BarraCarregando } from '@/components/efeitos';
import { Botao, Campo, Mensagem } from '@/components/formulario';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { NOME_DO_PAPEL, podeGerenciarUsuarios } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, entrelinha, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Condominio, Poste } from '@/lib/types';

interface Linha extends Condominio {
  postes: number;
  cameras: number;
}

/**
 * Aba de administração (só ADMIN e DEV). Ponto de partida: escolher o condomínio.
 * Dentro dele ficam os postes e as câmeras — criar, editar, desativar, trocar chave.
 */
export default function AdministracaoScreen() {
  const router = useRouter();
  const { usuario } = useAuth();
  const { cores } = useTema();
  const styles = useEstilos(criarEstilos);
  const [linhas, setLinhas] = useState<Linha[]>([]);
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
      const conta = new Map<number, { postes: number; cameras: number }>();
      for (const p of postes) {
        const a = conta.get(p.condominio_id) ?? { postes: 0, cameras: 0 };
        conta.set(p.condominio_id, { postes: a.postes + 1, cameras: a.cameras + p.total_cameras });
      }
      setLinhas(
        condominios
          .map(c => ({ ...c, postes: conta.get(c.id)?.postes ?? 0, cameras: conta.get(c.id)?.cameras ?? 0 }))
          // quem já tem poste primeiro; depois por nome
          .sort((a, b) => (b.postes > 0 ? 1 : 0) - (a.postes > 0 ? 1 : 0) || a.nome.localeCompare(b.nome)),
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os condomínios. Puxe a tela para tentar de novo.');
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

  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return termo ? linhas.filter(l => l.nome.toUpperCase().includes(termo)) : linhas;
  }, [linhas, busca]);

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
            <Text style={styles.titulo}>Administração</Text>
            {usuario && (
              <Text style={styles.apoio}>
                Você entrou como {NOME_DO_PAPEL[usuario.role].toLowerCase()}. Escolha um condomínio para cuidar dos postes e das câmeras dele.
              </Text>
            )}

            {podeGerenciarUsuarios(usuario?.role) && (
              <Botao titulo="Usuários do sistema" variante="secundario" onPress={() => router.push('/admin/usuarios')} />
            )}

            {erro && <Mensagem texto={erro} tom="erro" />}
            <Campo rotulo="Condomínio" placeholder="Buscar pelo nome" autoCorrect={false} value={busca} onChangeText={setBusca} />
          </View>
        }
        ListEmptyComponent={
          !carregando && !erro ? (
            <Mensagem texto={busca.trim() ? `Nenhum condomínio com "${busca.trim()}" no nome.` : 'Nenhum condomínio ativo no sistema.'} />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/admin/condominio/[id]', params: { id: String(item.id), nome: item.nome } })}
            accessibilityRole="button"
            accessibilityLabel={`Administrar ${item.nome}`}
            style={({ pressed }) => [styles.linha, pressed && styles.linhaPressionada]}
          >
            <View style={[styles.trilho, item.postes === 0 && styles.trilhoVazio]} />
            <View style={styles.linhaTexto}>
              <Text style={styles.nome} numberOfLines={2}>{item.nome}</Text>
              <Text style={styles.resumo}>
                {item.postes === 0
                  ? 'Sem poste cadastrado'
                  : `${item.postes} ${item.postes === 1 ? 'poste' : 'postes'}, ${item.cameras} ${item.cameras === 1 ? 'câmera' : 'câmeras'}`}
              </Text>
            </View>
            <Text style={styles.acao}>Administrar</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  lista: { paddingHorizontal: espaco[4], paddingBottom: espaco[10], gap: espaco[2] },
  cabecalho: { paddingTop: espaco[2], paddingBottom: espaco[2], gap: espaco[4] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.destaque, lineHeight: entrelinha.destaque, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, marginTop: -espaco[3] },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin + espaco[2], paddingRight: espaco[4],
    backgroundColor: c.superficie, borderRadius: componentes.cartao.raio, borderWidth: 1, borderColor: c.linha, overflow: 'hidden',
  },
  linhaPressionada: { borderColor: c.azul, boxShadow: c.brilho },
  trilho: { width: componentes.poste.trilho, alignSelf: 'stretch', backgroundColor: c.luz },
  trilhoVazio: { backgroundColor: 'transparent' },
  linhaTexto: { flex: 1, paddingVertical: espaco[3], gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nome, lineHeight: entrelinha.base, color: c.texto },
  resumo: { fontFamily: fontes.texto, fontSize: corpo.legenda, color: c.textoSuave },
  acao: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },
});
