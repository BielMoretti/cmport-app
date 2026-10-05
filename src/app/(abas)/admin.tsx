import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { GlifoPessoas, GlifoPredio, GlifoPulso } from '@/components/arte';
import { Entrada } from '@/components/efeitos';
import { Campo, Mensagem } from '@/components/formulario';
import { Bloco, Cartao, Esqueleto, IconeCaixa, Saudacao } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { podeGerenciarUsuarios } from '@/lib/acesso';
import { api, ApiError } from '@/lib/api';
import { componentes, corpo, espaco, fontes, type Paleta } from '@/lib/tema';
import type { Camera, Condominio, Poste } from '@/lib/types';

interface Linha extends Condominio {
  postes: number;
  cameras: number;
}

// com a lista inteira (centenas de condomínios) a tela fica pesada; mostra os primeiros e pede busca
const MAX_VISIVEIS = 30;

/**
 * Gestão (quem gerencia câmeras: DEV, ADMIN_MASTER, ADMIN e TECNICO).
 * Em cima, as ferramentas; embaixo, escolher o condomínio para cuidar dos postes e câmeras dele.
 */
export default function GestaoScreen() {
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
    try {
      const [condominios, postes, cameras] = await Promise.all([
        api<Condominio[]>('/condominios?tipo=CONDOMINIO&ativo=true&limit=700'),
        api<Poste[]>('/postes'),
        api<Camera[]>('/cameras'),
      ]);
      const conta = new Map<number, { postes: number; cameras: number }>();
      const de = (id: number) => conta.get(id) ?? { postes: 0, cameras: 0 };
      for (const p of postes) conta.set(p.condominio_id, { ...de(p.condominio_id), postes: de(p.condominio_id).postes + 1 });
      for (const c of cameras) conta.set(c.condominio_id, { ...de(c.condominio_id), cameras: de(c.condominio_id).cameras + 1 });
      setLinhas(
        condominios
          .map(c => ({ ...c, ...de(c.id) }))
          // quem já tem algo instalado primeiro; depois por nome
          .sort((a, b) => Number(b.postes + b.cameras > 0) - Number(a.postes + a.cameras > 0) || a.nome.localeCompare(b.nome)),
      );
      setErro(null);
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

  const filtradas = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return termo ? linhas.filter(l => l.nome.toUpperCase().includes(termo)) : linhas;
  }, [linhas, busca]);

  const ferramenta = (titulo: string, apoio: string, icone: React.ReactNode, aoTocar: () => void) => (
    <Cartao onPress={aoTocar} rotulo={`${titulo}. ${apoio}`} style={styles.linha}>
      <IconeCaixa>{icone}</IconeCaixa>
      <View style={styles.linhaTexto}>
        <Text style={styles.nome}>{titulo}</Text>
        <Text style={styles.resumo}>{apoio}</Text>
      </View>
    </Cartao>
  );

  return (
    <View style={styles.tela}>
      <ScrollView
        contentContainerStyle={styles.conteudo}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} tintColor={cores.azul} />}
      >
        <Saudacao titulo="Gestão" />

        <View style={styles.corpo}>
          <Bloco titulo="Ferramentas">
            {ferramenta('Diagnóstico das câmeras', 'Conexão, qualidade do vídeo e espaço de gravação',
              <GlifoPulso cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />, () => router.push('/admin/diagnostico'))}
            {podeGerenciarUsuarios(usuario?.role) && ferramenta('Usuários', 'Quem entra, com qual nível e em quais condomínios',
              <GlifoPessoas cor={cores.azul} tamanho={componentes.iconeCaixa.glifo} />, () => router.push('/admin/usuarios'))}
          </Bloco>

          <Bloco titulo="Postes e câmeras">
            <Campo rotulo="Escolha o condomínio" placeholder="Buscar pelo nome" autoCorrect={false} value={busca} onChangeText={setBusca} />
            {erro && <Mensagem texto={erro} tom="erro" />}

            {carregando ? (
              <>
                <Esqueleto altura={componentes.linha.alturaMin + espaco[4]} />
                <Esqueleto altura={componentes.linha.alturaMin + espaco[4]} />
              </>
            ) : filtradas.length === 0 && !erro ? (
              <Mensagem texto={busca.trim() ? `Nenhum condomínio com "${busca.trim()}" no nome.` : 'Nenhum condomínio ativo no sistema.'} />
            ) : (
              filtradas.slice(0, MAX_VISIVEIS).map((l, i) => {
                const instalado = l.postes + l.cameras > 0;
                return (
                  <Entrada key={l.id} ordem={i}>
                    <Cartao
                      onPress={() => router.push({ pathname: '/admin/condominio/[id]', params: { id: String(l.id), nome: l.nome } })}
                      rotulo={`Gerenciar ${l.nome}`}
                      style={styles.linha}
                    >
                      <IconeCaixa tom={instalado ? 'azul' : 'suave'}>
                        <GlifoPredio cor={instalado ? cores.azul : cores.textoSuave} tamanho={componentes.iconeCaixa.glifo} />
                      </IconeCaixa>
                      <View style={styles.linhaTexto}>
                        <Text style={styles.nome} numberOfLines={2}>{l.nome}</Text>
                        <Text style={styles.resumo}>
                          {instalado
                            ? `${l.postes} ${l.postes === 1 ? 'poste' : 'postes'}, ${l.cameras} ${l.cameras === 1 ? 'câmera' : 'câmeras'}`
                            : 'Nada instalado ainda'}
                        </Text>
                      </View>
                    </Cartao>
                  </Entrada>
                );
              })
            )}
            {filtradas.length > MAX_VISIVEIS && (
              <Mensagem texto={`Mostrando ${MAX_VISIVEIS} de ${filtradas.length}. Use a busca para achar os outros.`} />
            )}
          </Bloco>
        </View>
      </ScrollView>
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: c.fundo },
  conteudo: { paddingBottom: componentes.abas.reserva, width: '100%', maxWidth: componentes.conteudo.larguraMaxima, alignSelf: 'center' },
  corpo: { paddingHorizontal: espaco[5], gap: espaco[6] },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco[3], padding: espaco[3.5] },
  linhaTexto: { flex: 1, gap: espaco[0.5] },
  nome: { fontFamily: fontes.nome, fontSize: corpo.nome, color: c.texto },
  resumo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
});
