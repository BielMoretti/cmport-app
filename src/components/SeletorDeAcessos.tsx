import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Campo, Mensagem } from '@/components/formulario';
import { useEstilos } from '@/contexts/TemaContext';
import { componentes, corpo, entrelinha, espaco, fontes, vidro, type Paleta } from '@/lib/tema';
import type { Camera, Poste } from '@/lib/types';

/** Um condomínio na lista: os postes dele (com as câmeras) e as câmeras fora de poste. */
interface Grupo {
  condominioId: number;
  nome: string;
  postes: { poste: Poste; cameras: Camera[] }[];
  avulsas: Camera[];
}

export interface Acessos {
  postes: Set<number>;
  cameras: Set<number>;
}

/** Quantas câmeras uma liberação alcança: as dos postes marcados mais as marcadas uma a uma. */
export function camerasAlcancadas(cameras: Camera[], acessos: Acessos): number {
  return cameras.filter(c => acessos.cameras.has(c.id) || (c.poste_id !== null && acessos.postes.has(c.poste_id))).length;
}

/**
 * Escolher o que um morador (ou vários) vê: postes inteiros e câmeras uma a uma,
 * agrupados por condomínio, com busca. Usado na ficha do morador, no cadastro em lote
 * e na liberação em grupo.
 */
export default function SeletorDeAcessos({
  postes, cameras, valor, aoMudar,
}: { postes: Poste[]; cameras: Camera[]; valor: Acessos; aoMudar: (novo: Acessos) => void }) {
  const styles = useEstilos(criarEstilos);
  const [busca, setBusca] = useState('');

  // tudo agrupado por condomínio: os postes com as câmeras de cada um e, por último, as câmeras fora de poste
  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<number, Grupo>();
    const grupo = (id: number, nomeDoCondominio: string | null) => {
      if (!mapa.has(id)) mapa.set(id, { condominioId: id, nome: nomeDoCondominio ?? `Condomínio ${id}`, postes: [], avulsas: [] });
      return mapa.get(id)!;
    };
    const idsDePoste = new Set(postes.map(p => p.id));
    for (const p of postes) grupo(p.condominio_id, p.condominio_nome).postes.push({ poste: p, cameras: cameras.filter(c => c.poste_id === p.id) });
    for (const c of cameras) if (c.poste_id === null || !idsDePoste.has(c.poste_id)) grupo(c.condominio_id, c.condominio_nome).avulsas.push(c);
    const termo = busca.trim().toUpperCase();
    const bate = (texto: string) => texto.toUpperCase().includes(termo);
    const temMarca = (g: Grupo) => g.postes.some(x => valor.postes.has(x.poste.id) || x.cameras.some(c => valor.cameras.has(c.id))) || g.avulsas.some(c => valor.cameras.has(c.id));
    return [...mapa.values()]
      // a busca vale para o nome do condomínio, do poste ou da câmera
      .filter(g => !termo || bate(g.nome) || g.postes.some(x => bate(x.poste.nome) || x.cameras.some(c => bate(c.nome))) || g.avulsas.some(c => bate(c.nome)))
      // quem já tem algo liberado primeiro, pra a pessoa ver de cara
      .sort((a, b) => Number(temMarca(b)) - Number(temMarca(a)) || a.nome.localeCompare(b.nome));
  }, [postes, cameras, busca, valor]);

  const alternarPoste = (posteId: number) => {
    const novosPostes = new Set(valor.postes);
    let novasCameras = valor.cameras;
    if (novosPostes.has(posteId)) {
      novosPostes.delete(posteId);
    } else {
      novosPostes.add(posteId);
      // poste inteiro liberado: as marcas das câmeras dele uma a uma ficam sobrando
      novasCameras = new Set([...valor.cameras].filter(id => cameras.find(c => c.id === id)?.poste_id !== posteId));
    }
    aoMudar({ postes: novosPostes, cameras: novasCameras });
  };
  const alternarCamera = (cameraId: number) => {
    const novas = new Set(valor.cameras);
    if (novas.has(cameraId)) novas.delete(cameraId); else novas.add(cameraId);
    aoMudar({ postes: valor.postes, cameras: novas });
  };

  const caixa = (marcado: boolean, apagada = false) => (
    <View style={[styles.caixa, marcado && styles.caixaMarcada, apagada && styles.caixaApagada]}>
      {marcado && <View style={styles.caixaMiolo} />}
    </View>
  );

  const linhaDeCamera = (c: Camera, peloPoste: boolean) => {
    const marcada = peloPoste || valor.cameras.has(c.id);
    return (
      <Pressable
        key={`c${c.id}`}
        onPress={() => alternarCamera(c.id)}
        disabled={peloPoste}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcada, disabled: peloPoste }}
        accessibilityLabel={`Câmera ${c.nome}${peloPoste ? ', liberada pelo poste' : ''}`}
        style={({ pressed }) => [styles.linha, styles.linhaDeCamera, pressed && styles.linhaPressionada]}
      >
        {caixa(marcada, peloPoste)}
        <Text style={[styles.linhaNome, marcada && styles.linhaNomeMarcado]} numberOfLines={2}>{c.nome}</Text>
        {peloPoste && <Text style={styles.nota}>pelo poste</Text>}
      </Pressable>
    );
  };

  return (
    <View style={styles.bloco}>
      <Campo rotulo="Buscar" placeholder="Condomínio, poste ou câmera" autoCorrect={false} value={busca} onChangeText={setBusca} />

      {grupos.length === 0 && <Mensagem texto={busca.trim() ? 'Nada encontrado com esse nome.' : 'Ainda não há poste nem câmera cadastrados.'} />}

      {grupos.slice(0, 20).map(g => (
        <View key={g.condominioId} style={styles.grupo}>
          <Text style={styles.grupoNome} accessibilityRole="header">{g.nome}</Text>
          {g.postes.map(({ poste, cameras: doPoste }) => {
            const inteiro = valor.postes.has(poste.id);
            return (
              <View key={`p${poste.id}`}>
                <Pressable
                  onPress={() => alternarPoste(poste.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: inteiro }}
                  accessibilityLabel={`Poste inteiro: ${poste.nome}, ${doPoste.length} ${doPoste.length === 1 ? 'câmera' : 'câmeras'}`}
                  style={({ pressed }) => [styles.linha, pressed && styles.linhaPressionada]}
                >
                  {caixa(inteiro)}
                  <View style={styles.linhaTexto}>
                    <Text style={[styles.linhaNome, styles.posteNome, inteiro && styles.linhaNomeMarcado]} numberOfLines={2}>{poste.nome}</Text>
                    <Text style={styles.nota}>Poste inteiro, {doPoste.length} {doPoste.length === 1 ? 'câmera' : 'câmeras'}</Text>
                  </View>
                </Pressable>
                {doPoste.map(c => linhaDeCamera(c, inteiro))}
              </View>
            );
          })}
          {g.avulsas.length > 0 && (
            <View>
              <Text style={styles.subtitulo}>Fora de poste</Text>
              {g.avulsas.map(c => linhaDeCamera(c, false))}
            </View>
          )}
        </View>
      ))}
      {grupos.length > 20 && <Mensagem texto={`Mostrando 20 de ${grupos.length} condomínios. Use a busca para achar os outros.`} />}
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  bloco: { gap: espaco[3] },
  linha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.alvoDeToque + espaco[1],
    paddingVertical: espaco[2], borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  linhaPressionada: { backgroundColor: c.azulSuave },
  linhaDeCamera: { paddingLeft: espaco[8] },
  linhaTexto: { flex: 1, gap: espaco[0.5] },
  posteNome: { flex: 0, fontFamily: fontes.textoForte, color: c.texto },
  nota: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
  grupo: { ...vidro(c), borderRadius: componentes.cartao.raio, paddingHorizontal: espaco[4], paddingTop: espaco[3.5], paddingBottom: espaco[1] },
  grupoNome: { fontFamily: fontes.nome, fontSize: corpo.nome, lineHeight: entrelinha.base, color: c.texto, marginBottom: espaco[1] },
  subtitulo: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave, marginTop: espaco[3] },
  caixa: {
    width: componentes.caixaDeMarcar, height: componentes.caixaDeMarcar, borderRadius: espaco[1.5],
    borderWidth: 2, borderColor: c.textoSuave, alignItems: 'center', justifyContent: 'center',
  },
  caixaMarcada: { borderColor: c.luz, backgroundColor: c.luz, boxShadow: c.brilho },
  caixaApagada: { opacity: 0.45 },
  caixaMiolo: { width: componentes.caixaDeMarcar / 2.4, height: componentes.caixaDeMarcar / 2.4, borderRadius: espaco[0.5], backgroundColor: c.sobreLuz },
  linhaNome: { flex: 1, fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },
  linhaNomeMarcado: { fontFamily: fontes.textoForte, color: c.texto },
});
