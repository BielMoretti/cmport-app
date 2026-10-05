import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarraCarregando } from '@/components/efeitos';
import MarcaDagua from '@/components/MarcaDagua';
import { useEstilos } from '@/contexts/TemaContext';
import { ApiError } from '@/lib/api';
import { buscarGravacoes, pedirVideo, type Trecho } from '@/lib/gravacoes';
import { componentes, corpo, entrelinha, espaco, fontes, raio, type Paleta } from '@/lib/tema';

// O servidor guarda no máximo 7 dias de gravação (recordDeleteAfter do MediaMTX)
const DIAS = 7;
const HORAS = Array.from({ length: 24 }, (_, h) => h);

function diasRecentes(): Date[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Array.from({ length: DIAS }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    return d;
  });
}

function rotuloDia(dia: Date, indice: number): string {
  if (indice === 0) return 'Hoje';
  if (indice === 1) return 'Ontem';
  return dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }).replace(/[.,]/g, '');
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
export const horaDoTrecho = (t: Trecho) => `${doisDigitos(t.inicio.getHours())}:${doisDigitos(t.inicio.getMinutes())}`;

function mensagemDeErro(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) return 'O servidor ainda não tem gravações para esta câmera.';
  if (e instanceof ApiError) return e.message;
  return 'Não foi possível buscar as gravações. Tente de novo.';
}

/**
 * Gravações da câmera: escolhe o dia, vê as 24 horas (azul = teve movimento) e,
 * dentro da hora, os trechos de ~1 minuto.
 */
export default function Gravacoes({
  cameraId, tocando, onAssistir,
}: { cameraId: number; tocando: Trecho | null; onAssistir: (trecho: Trecho, url: string) => void }) {
  const styles = useEstilos(criarEstilos);
  const dias = useMemo(diasRecentes, []);
  const [indiceDia, setIndiceDia] = useState(0);
  const [trechos, setTrechos] = useState<Trecho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [hora, setHora] = useState<number | null>(null);
  const [soMovimento, setSoMovimento] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setAviso(null);
    buscarGravacoes(cameraId, dias[indiceDia])
      .then(lista => {
        if (cancelado) return;
        setTrechos(lista);
        // Abre na última hora com movimento; se não houve movimento, na última hora gravada
        const comMovimento = lista.filter(t => t.movimento);
        const referencia = comMovimento.at(-1) ?? lista.at(-1);
        setHora(referencia ? referencia.inicio.getHours() : null);
        setSoMovimento(comMovimento.length > 0);
      })
      .catch(e => {
        if (cancelado) return;
        setTrechos([]);
        setHora(null);
        setErro(mensagemDeErro(e));
      })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [cameraId, dias, indiceDia, tentativa]);

  // Por hora: quantos trechos foram gravados e quantos tiveram movimento
  const porHora = useMemo(() => {
    const mapa = new Map<number, { gravados: number; movimento: number }>();
    for (const t of trechos) {
      const h = t.inicio.getHours();
      const atual = mapa.get(h) ?? { gravados: 0, movimento: 0 };
      mapa.set(h, { gravados: atual.gravados + 1, movimento: atual.movimento + (t.movimento ? 1 : 0) });
    }
    return mapa;
  }, [trechos]);

  const daHora = useMemo(
    () => trechos.filter(t => t.inicio.getHours() === hora && (!soMovimento || t.movimento)),
    [trechos, hora, soMovimento],
  );

  async function assistir(trecho: Trecho) {
    if (!trecho.disponivel) {
      setAviso(`O trecho das ${horaDoTrecho(trecho)} já saiu do servidor e não está mais disponível.`);
      return;
    }
    setAviso(null);
    setAbrindo(trecho.id);
    try {
      // o link vale poucos minutos — por isso é pedido só na hora de assistir
      onAssistir(trecho, await pedirVideo(cameraId, trecho.id));
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : `Não foi possível abrir o trecho das ${horaDoTrecho(trecho)}. Tente de novo.`);
    } finally {
      setAbrindo(null);
    }
  }

  return (
    <View style={styles.bloco}>
      <Text style={styles.titulo} accessibilityRole="header">Gravações</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dias}>
        {dias.map((dia, i) => {
          const ativo = i === indiceDia;
          return (
            <Pressable
              key={dia.toISOString()}
              onPress={() => setIndiceDia(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              style={[styles.dia, ativo && styles.diaAtivo]}
            >
              <Text style={[styles.diaTexto, ativo && styles.diaTextoAtivo]}>{rotuloDia(dia, i)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <BarraCarregando ativa={carregando} />

      {erro && (
        <View style={styles.mensagem}>
          <Text style={styles.erro} accessibilityRole="alert">{erro}</Text>
          <Pressable onPress={() => setTentativa(t => t + 1)} accessibilityRole="button">
            <Text style={styles.link}>Tentar de novo</Text>
          </Pressable>
        </View>
      )}

      {!carregando && !erro && trechos.length === 0 && (
        <Text style={styles.vazio}>Nenhuma gravação neste dia.</Text>
      )}

      {!erro && trechos.length > 0 && (
        <>
          <View style={styles.grade}>
            {HORAS.map(h => {
              const info = porHora.get(h);
              const movimento = (info?.movimento ?? 0) > 0;
              return (
                <View key={h} style={styles.celulaCaixa}>
                  <Pressable
                    disabled={!info}
                    onPress={() => { setHora(h); if (!movimento) setSoMovimento(false); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: hora === h, disabled: !info }}
                    accessibilityLabel={
                      !info ? `${h} horas, sem gravação`
                        : movimento ? `${h} horas, ${info.movimento} minutos com movimento`
                        : `${h} horas, gravado sem movimento`
                    }
                    style={[
                      styles.celula,
                      !!info && styles.celulaGravada,
                      movimento && styles.celulaMovimento,
                      hora === h && styles.celulaSelecionada,
                    ]}
                  >
                    <Text style={[styles.celulaHora, !info && styles.celulaVazia, movimento && styles.sobreAzul]}>
                      {doisDigitos(h)}h
                    </Text>
                    {movimento && <Text style={[styles.celulaMin, styles.sobreAzul]}>{info!.movimento} min</Text>}
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={styles.legenda}>
            <View style={[styles.amostra, styles.celulaMovimento]} />
            <Text style={styles.legendaTexto}>Teve movimento</Text>
            <View style={[styles.amostra, styles.celulaGravada]} />
            <Text style={styles.legendaTexto}>Gravou sem movimento</Text>
          </View>

          {hora !== null && (
            <>
              <View style={styles.horaCabeca}>
                <Text style={styles.horaTitulo}>Das {doisDigitos(hora)}h às {doisDigitos((hora + 1) % 24)}h</Text>
                <Pressable
                  onPress={() => setSoMovimento(v => !v)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: soMovimento }}
                  style={[styles.filtro, soMovimento && styles.filtroAtivo]}
                >
                  <Text style={[styles.filtroTexto, soMovimento && styles.filtroTextoAtivo]}>Só com movimento</Text>
                </Pressable>
              </View>

              {aviso && <Text style={styles.erro} accessibilityRole="alert">{aviso}</Text>}

              {daHora.length === 0 ? (
                <Text style={styles.vazio}>Nenhum trecho com movimento nesta hora. Desligue o filtro para ver todos.</Text>
              ) : (
                daHora.map(t => {
                  const atual = tocando?.id === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => { void assistir(t); }}
                      disabled={abrindo !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Assistir o trecho das ${horaDoTrecho(t)}${t.movimento ? ', com movimento' : ''}`}
                      style={({ pressed }) => [styles.trecho, (pressed || atual) && styles.trechoAtivo]}
                    >
                      {t.miniaturaUrl ? (
                        <View style={styles.foto}>
                          <Image source={{ uri: t.miniaturaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                          <MarcaDagua tamanho="pequena" />
                        </View>
                      ) : (
                        <View style={[styles.marca, t.movimento && styles.marcaMovimento]} />
                      )}
                      <Text style={styles.trechoHora}>{horaDoTrecho(t)}</Text>
                      <Text style={[styles.trechoEstado, t.movimento && styles.trechoMovimento]}>
                        {t.movimento ? 'Movimento' : 'Sem movimento'}
                      </Text>
                      <Text style={styles.link}>{abrindo === t.id ? 'Abrindo' : atual ? 'Tocando' : t.disponivel ? 'Assistir' : 'Expirado'}</Text>
                    </Pressable>
                  );
                })
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  bloco: { paddingTop: espaco[5], gap: espaco[3] },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.titulo, lineHeight: entrelinha.titulo, color: c.texto, paddingHorizontal: espaco[5] },

  dias: { paddingHorizontal: espaco[5], gap: espaco[2] },
  dia: { borderRadius: raio.pilula, borderWidth: 1, borderColor: c.linha, paddingHorizontal: espaco[3.5], minHeight: componentes.chip.altura, justifyContent: 'center' },
  diaAtivo: { backgroundColor: c.azul, borderColor: c.azul, boxShadow: c.brilho },
  diaTexto: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.textoSuave },
  diaTextoAtivo: { color: c.sobreAzul },

  grade: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: espaco[4] },
  celulaCaixa: { width: '16.666%', padding: espaco[1] },
  celula: { height: componentes.celulaHora.altura, borderRadius: raio.medio, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  celulaGravada: { backgroundColor: c.superficie, borderColor: c.linha },
  celulaMovimento: { backgroundColor: c.azul, borderColor: c.azul },
  celulaSelecionada: { borderColor: c.texto, borderWidth: 2 },
  celulaHora: { fontFamily: fontes.nome, fontSize: corpo.base, color: c.texto },
  celulaVazia: { color: c.textoSuave, opacity: 0.5 },
  celulaMin: { fontFamily: fontes.texto, fontSize: corpo.micro, lineHeight: entrelinha.micro },
  sobreAzul: { color: c.sobreAzul },

  legenda: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: espaco[2], paddingHorizontal: espaco[5] },
  amostra: { width: espaco[3.5], height: espaco[3.5], borderRadius: raio.pequeno, borderWidth: 1 },
  legendaTexto: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, marginRight: espaco[2] },

  horaCabeca: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco[3],
    paddingHorizontal: espaco[5], paddingTop: espaco[2],
  },
  horaTitulo: { fontFamily: fontes.nome, fontSize: corpo.nomeGrande, color: c.texto },
  filtro: { borderRadius: raio.pilula, borderWidth: 1, borderColor: c.linha, paddingHorizontal: espaco[3], minHeight: componentes.chip.altura, justifyContent: 'center' },
  filtroAtivo: { backgroundColor: c.azulSuave, borderColor: c.azul },
  filtroTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave },
  filtroTextoAtivo: { color: c.azul },

  trecho: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin, paddingHorizontal: espaco[5],
    borderBottomWidth: 1, borderBottomColor: c.linha,
  },
  trechoAtivo: { backgroundColor: c.azulSuave },
  marca: { width: componentes.selo.ponto, height: componentes.selo.ponto, borderRadius: raio.pequeno, borderWidth: 1, borderColor: c.textoSuave },
  foto: { width: componentes.miniatura.largura, height: componentes.miniatura.altura, borderRadius: raio.pequeno, backgroundColor: c.superficie, overflow: 'hidden' },
  marcaMovimento: { backgroundColor: c.azul, borderColor: c.azul, boxShadow: c.brilho },
  trechoHora: { fontFamily: fontes.nome, fontSize: corpo.nome, color: c.texto, minWidth: espaco[12] },
  trechoEstado: { flex: 1, fontFamily: fontes.texto, fontSize: corpo.base, color: c.textoSuave },
  trechoMovimento: { color: c.texto },

  mensagem: { paddingHorizontal: espaco[5], gap: espaco[2] },
  erro: { fontFamily: fontes.textoForte, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.erro, paddingHorizontal: espaco[5] },
  link: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.azul },
  vazio: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave, paddingHorizontal: espaco[5] },
});
