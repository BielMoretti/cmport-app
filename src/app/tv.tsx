import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';

import CameraPlayer from '@/components/CameraPlayer';
import { api, ApiError } from '@/lib/api';
import { localeAtual, tr } from '@/lib/idioma';
import { estadoDe } from '@/lib/saude';
import { componentes, corpo, espaco, fontes, palco, raio } from '@/lib/tema';
import type { Camera } from '@/lib/types';

// de quanto em quanto tempo a parede troca de página, quando há mais câmeras do que cabem
const TROCAR_A_CADA_MS = 20_000;
// de quanto em quanto tempo a lista de câmeras é conferida de novo (uma que voltou entra na parede)
const CONFERIR_A_CADA_MS = 60_000;
// os controles somem sozinhos depois deste tempo sem toque
const ESCONDER_DEPOIS_DE_MS = 5_000;

const GRADES = [
  { porTela: 1, colunas: 1, fileiras: 1 },
  { porTela: 4, colunas: 2, fileiras: 2 },
  { porTela: 6, colunas: 3, fileiras: 2 },
] as const;
type PorTela = typeof GRADES[number]['porTela'];

const transmite = (c: Camera) => c.ativo && c.tipo_conexao === 'RTMP_ISOLADA' && estadoDe(c) !== 'offline';

/**
 * Modo TV: a parede de câmeras ao vivo, de ponta a ponta, para deixar numa TV ou num tablet
 * da portaria. A tela não apaga, fica deitada, e as páginas se revezam sozinhas. Um toque
 * mostra os controles (quantas por tela e sair).
 */
export default function ModoTvScreen() {
  const router = useRouter();
  useKeepAwake();

  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [porTela, setPorTela] = useState<PorTela>(4);
  const [pagina, setPagina] = useState(0);
  const [controles, setControles] = useState(true);
  const [hora, setHora] = useState(() => new Date());
  const esconder = useRef<ReturnType<typeof setTimeout> | null>(null);

  // tela deitada enquanto o Modo TV está aberto; ao sair volta a acompanhar o aparelho
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    return () => { void ScreenOrientation.unlockAsync().catch(() => {}); };
  }, []);

  const carregar = useCallback(async () => {
    try {
      const lista = await api<Camera[]>('/cameras');
      setCameras(lista.filter(transmite));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : tr('Não foi possível carregar as câmeras.'));
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => { void carregar(); }, CONFERIR_A_CADA_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const grade = GRADES.find(g => g.porTela === porTela) ?? GRADES[1];
  const total = cameras?.length ?? 0;
  const paginas = Math.max(1, Math.ceil(total / grade.porTela));
  const atual = pagina % paginas;

  // revezamento das páginas
  useEffect(() => {
    if (paginas <= 1) return;
    const t = setInterval(() => setPagina(p => (p + 1) % paginas), TROCAR_A_CADA_MS);
    return () => clearInterval(t);
  }, [paginas]);

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const mostrarControles = useCallback(() => {
    setControles(true);
    if (esconder.current) clearTimeout(esconder.current);
    esconder.current = setTimeout(() => setControles(false), ESCONDER_DEPOIS_DE_MS);
  }, []);

  useEffect(() => {
    mostrarControles();
    return () => { if (esconder.current) clearTimeout(esconder.current); };
  }, [mostrarControles]);

  const naTela = useMemo(
    () => (cameras ?? []).slice(atual * grade.porTela, (atual + 1) * grade.porTela),
    [cameras, atual, grade.porTela],
  );

  return (
    <View style={styles.tela}>
      <StatusBar hidden />

      {cameras === null && !erro ? (
        <View style={styles.centro}><ActivityIndicator color={palco.texto} /></View>
      ) : total === 0 ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>{erro ?? tr('Nenhuma câmera transmitindo ao vivo agora.')}</Text>
        </View>
      ) : (
        <View style={styles.parede}>
          {naTela.map(c => (
            <View key={c.id} style={{ width: `${100 / grade.colunas}%`, height: `${100 / grade.fileiras}%` }}>
              <View style={styles.janela}>
                <CameraPlayer cameraId={c.id} cheio reconectarSozinho />
                <View style={styles.etiqueta} pointerEvents="none">
                  <Text style={styles.etiquetaTexto} numberOfLines={1}>{c.nome}{c.condominio_nome ? ` · ${c.condominio_nome}` : ''}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* um toque em qualquer lugar traz os controles de volta */}
      {!controles && (
        <Pressable style={StyleSheet.absoluteFill} onPress={mostrarControles} accessibilityRole="button" accessibilityLabel={tr('Mostrar os controles do Modo TV')} />
      )}

      {controles && (
        <View style={styles.barra}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}>
            <Text style={styles.botaoTexto}>{tr('Sair do Modo TV')}</Text>
          </Pressable>
          <View style={styles.grades} accessibilityRole="radiogroup" accessibilityLabel={tr('Câmeras por tela')}>
            {GRADES.map(g => {
              const ativa = g.porTela === porTela;
              return (
                <Pressable
                  key={g.porTela}
                  onPress={() => { setPorTela(g.porTela); setPagina(0); mostrarControles(); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativa }}
                  accessibilityLabel={g.porTela === 1 ? tr('Uma câmera por tela') : tr('{0} câmeras por tela', [g.porTela])}
                  style={({ pressed }) => [styles.grade, ativa && styles.gradeAtiva, pressed && styles.pressionado]}
                >
                  <Text style={[styles.gradeTexto, ativa && styles.gradeTextoAtivo]}>{g.porTela}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* sempre à vista, discreto: a hora e em que página a parede está */}
      <View style={styles.rodape} pointerEvents="none">
        <Text style={styles.rodapeTexto}>
          {hora.toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' })}
          {paginas > 1 ? `  ·  ${atual + 1}/${paginas}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: palco.fundo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaco[6] },
  aviso: { fontFamily: fontes.texto, fontSize: corpo.nome, color: palco.texto, textAlign: 'center' },
  parede: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  // um fio preto entre as janelas, para uma imagem não emendar na outra
  janela: { flex: 1, margin: StyleSheet.hairlineWidth, overflow: 'hidden' },
  etiqueta: {
    position: 'absolute', left: espaco[3], bottom: espaco[3], maxWidth: '80%',
    backgroundColor: palco.veu, borderRadius: raio.pequeno, paddingHorizontal: espaco[2], paddingVertical: espaco[1],
  },
  etiquetaTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: palco.texto },

  barra: {
    position: 'absolute', top: espaco[4], left: espaco[4], right: espaco[4],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco[3],
  },
  botao: {
    backgroundColor: palco.botaoFundo, borderRadius: componentes.botaoNoPalco.raio,
    paddingHorizontal: componentes.botaoNoPalco.respiroH, minHeight: componentes.botaoNoPalco.altura, justifyContent: 'center',
  },
  botaoTexto: { fontFamily: fontes.nome, fontSize: corpo.base, color: palco.botaoTexto },
  grades: { flexDirection: 'row', gap: espaco[1], backgroundColor: palco.veu, borderRadius: componentes.botaoNoPalco.raio, padding: espaco[1] },
  grade: { minWidth: componentes.botaoNoPalco.altura, minHeight: componentes.botaoNoPalco.altura - espaco[2], alignItems: 'center', justifyContent: 'center', borderRadius: componentes.botaoNoPalco.raio - espaco[1] },
  gradeAtiva: { backgroundColor: palco.botaoFundo },
  gradeTexto: { fontFamily: fontes.nome, fontSize: corpo.base, color: palco.texto },
  gradeTextoAtivo: { color: palco.botaoTexto },
  pressionado: { opacity: 0.7 },

  rodape: { position: 'absolute', right: espaco[3], bottom: espaco[3], backgroundColor: palco.veu, borderRadius: raio.pequeno, paddingHorizontal: espaco[2], paddingVertical: espaco[1] },
  rodapeTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: palco.texto, fontVariant: ['tabular-nums'] },
});
