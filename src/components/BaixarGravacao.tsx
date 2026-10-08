import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Botao, Mensagem } from '@/components/formulario';
import Gravador, { MINUTOS_MAXIMOS } from '@/components/Gravador';
import { Progresso } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { textoDaMarca } from '@/lib/acesso';
import type { ControlesDoGravador } from '@/lib/baixar';
import { pedirVideo, type Trecho } from '@/lib/gravacoes';
import { aceso, componentes, corpo, entrelinha, espaco, fontes, palco, raio, vidro, type Paleta } from '@/lib/tema';

// os atalhos que cabem no limite da plataforma (30 min no navegador, 10 no aparelho)
const ATALHOS = [1, 5, 10, 30].filter(m => m <= MINUTOS_MAXIMOS);
const MINUTO = 60_000;

const dois = (n: number) => String(n).padStart(2, '0');
const horaDe = (d: Date) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;

/** "0612" ou "6:12" vira "06:12" enquanto a pessoa digita. */
function mascarar(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 4);
  return digitos.length <= 2 ? digitos : `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

/** Hora digitada → minutos desde a meia-noite; null se não for uma hora válida. "24:00" vale como fim do dia. */
function lerHora(texto: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(texto);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min === 0) return 24 * 60;
  return h < 24 && min < 60 ? h * 60 + min : null;
}

const escreverHora = (minutos: number) => `${dois(Math.floor(minutos / 60))}:${dois(minutos % 60)}`;

interface Props {
  visivel: boolean;
  aoFechar: () => void;
  cameraId: number;
  nomeDaCamera: string;
  /** o dia que está na tela (00:00, hora local) */
  dia: Date;
  /** os trechos gravados nesse dia */
  trechos: Trecho[];
  /** intervalo que já vem preenchido: o que a pessoa estava assistindo */
  sugestao: { de: Date; ate: Date } | null;
}

/**
 * Janela de baixar gravação: a pessoa escolhe de que horas a que horas, e o arquivo
 * sai num MP4 só, com a marca d'água gravada dentro do vídeo.
 */
export default function BaixarGravacao({ visivel, aoFechar, cameraId, nomeDaCamera, dia, trechos, sugestao }: Props) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const { usuario } = useAuth();
  const gravador = useRef<ControlesDoGravador>(null);

  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [progresso, setProgresso] = useState<number | null>(null);   // fração pronta, de 0 a 1
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  // a cada abertura, começa do que a pessoa estava assistindo (ou da primeira gravação do dia)
  useEffect(() => {
    if (!visivel) return;
    const inicio = sugestao?.de ?? trechos.find(t => t.disponivel)?.inicio ?? dia;
    const minutosDoInicio = inicio.getHours() * 60 + inicio.getMinutes();
    const fim = sugestao ? Math.ceil((sugestao.ate.getTime() - dia.getTime()) / MINUTO) : minutosDoInicio + 1;
    setDe(escreverHora(minutosDoInicio));
    setAte(escreverHora(Math.min(24 * 60, Math.max(fim, minutosDoInicio + 1), minutosDoInicio + MINUTOS_MAXIMOS)));
    setErro(null);
    setFeito(null);
    setProgresso(null);
    // só ao abrir: mudar a sugestão com a janela aberta não pode apagar o que a pessoa digitou
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  const minDe = lerHora(de);
  const minAte = lerHora(ate);

  const analise = useMemo(() => {
    if (minDe === null || minAte === null) return { problema: 'Digite as duas horas no formato 00:00.', partes: [] as Trecho[], gravado: 0 };
    if (minAte <= minDe) return { problema: 'A hora final precisa ser depois da inicial.', partes: [], gravado: 0 };
    if (minAte - minDe > MINUTOS_MAXIMOS) return { problema: `Baixe no máximo ${MINUTOS_MAXIMOS} minutos por vez.`, partes: [], gravado: 0 };
    const inicio = dia.getTime() + minDe * MINUTO;
    const fim = dia.getTime() + minAte * MINUTO;
    const partes = trechos.filter(t => t.disponivel && t.fim.getTime() > inicio && t.inicio.getTime() < fim);
    const gravado = partes.reduce((soma, t) => soma + Math.min(t.fim.getTime(), fim) - Math.max(t.inicio.getTime(), inicio), 0);
    if (partes.length === 0) return { problema: 'Não há gravação disponível nesse intervalo.', partes, gravado: 0 };
    return { problema: null, partes, gravado };
  }, [minDe, minAte, dia, trechos]);

  const baixando = progresso !== null;
  const pedido = minDe !== null && minAte !== null ? minAte - minDe : 0;
  const minutosGravados = Math.round(analise.gravado / MINUTO);

  async function baixar() {
    if (analise.problema || !usuario || minDe === null || minAte === null || baixando) return;
    const inicio = new Date(dia.getTime() + minDe * MINUTO);
    const fim = new Date(dia.getTime() + minAte * MINUTO);
    const carimbo = `${dia.getFullYear()}${dois(dia.getMonth() + 1)}${dois(dia.getDate())}-${de.replace(':', '')}-${ate.replace(':', '')}`;
    setErro(null);
    setFeito(null);
    setProgresso(0);
    try {
      if (!gravador.current) throw new Error('O gravador de vídeo não está pronto. Feche esta janela e tente de novo.');
      const agora = new Date();
      const quando = `${agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${horaDe(agora)}`;
      const { partesPuladas, destino } = await gravador.current.gravar({
        partes: analise.partes.map(t => ({ inicio: t.inicio, fim: t.fim, buscarUrl: () => pedirVideo(cameraId, t.id) })),
        de: inicio,
        ate: fim,
        nomeDoArquivo: `cmport-camera${cameraId}-${carimbo}.mp4`,
        // quem baixou e quando: é isto que fica repetido por todo o quadro
        marca: `${textoDaMarca(usuario)}  ${quando}`,
        rotulo: nomeDaCamera,
        aoProgredir: setProgresso,
      });
      const onde = destino === 'galeria' ? 'Ele está na galeria do aparelho.'
        : destino === 'compartilhado' ? 'Escolha onde salvar na janela que abriu.'
        : 'Ele está na pasta de downloads do navegador.';
      setFeito(partesPuladas > 0
        ? `Vídeo pronto, mas ${partesPuladas} ${partesPuladas === 1 ? 'minuto não pôde ser buscado e ficou' : 'minutos não puderam ser buscados e ficaram'} de fora. ${onde}`
        : `Vídeo pronto. ${onde}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível baixar esse intervalo.');
    } finally {
      setProgresso(null);
    }
  }

  const fechar = () => { if (!baixando) aoFechar(); };

  const campo = (rotulo: string, valor: string, mudar: (v: string) => void) => (
    <View style={styles.campoCaixa}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={t => mudar(mascarar(t))}
        editable={!baixando}
        keyboardType="number-pad"
        maxLength={5}
        placeholder="00:00"
        placeholderTextColor={cores.textoSuave}
        selectTextOnFocus
        accessibilityLabel={`${rotulo}, hora e minuto`}
        style={styles.campo}
      />
    </View>
  );

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={fechar} statusBarTranslucent>
      <View style={styles.fundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityLabel="Fechar" />
        <View style={styles.janela} accessibilityViewIsModal>
          <View style={styles.fio} pointerEvents="none" />
          {/* no aparelho é uma página invisível que regrava o vídeo; no navegador não desenha nada */}
          <Gravador ref={gravador} />
          <View>
            <Text style={styles.titulo} accessibilityRole="header">Baixar gravação</Text>
            <Text style={styles.apoio}>
              {nomeDaCamera}, {dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
            </Text>
          </View>

          <View style={styles.horas}>
            {campo('Das', de, setDe)}
            {campo('Até as', ate, setAte)}
          </View>

          <View style={styles.atalhos}>
            <Text style={styles.rotuloSolto}>Duração</Text>
            {ATALHOS.map(minutos => {
              const ativo = minDe !== null && minAte !== null && minAte - minDe === minutos;
              return (
                <Pressable
                  key={minutos}
                  disabled={baixando || minDe === null}
                  onPress={() => { if (minDe !== null) setAte(escreverHora(Math.min(24 * 60, minDe + minutos))); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={`${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} a partir da hora inicial`}
                  style={[styles.chip, ativo && styles.chipAtivo]}
                >
                  <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{minutos} min</Text>
                </Pressable>
              );
            })}
          </View>

          {analise.problema ? (
            <Mensagem texto={analise.problema} tom={de.length === 5 && ate.length === 5 ? 'erro' : 'suave'} />
          ) : (
            <Mensagem
              texto={minutosGravados < pedido
                ? `Desses ${pedido} min, ${minutosGravados} min ${minutosGravados === 1 ? 'tem' : 'têm'} gravação. Os buracos são pulados; o relógio no vídeo mostra a hora de cada cena.`
                : `${pedido} min de gravação, num arquivo só, com a marca d'água gravada em todo o vídeo.`}
            />
          )}

          {baixando && (
            <View style={styles.andamento}>
              <Text style={styles.andamentoTexto} accessibilityLiveRegion="polite">Preparando o vídeo… {Math.round(progresso * 100)}%. Não feche esta janela.</Text>
              <Progresso fracao={progresso} rotulo="Preparando o download" />
            </View>
          )}
          {erro && <Mensagem texto={erro} tom="erro" />}
          {feito && <Mensagem texto={feito} tom="azul" />}

          <View style={styles.acoes}>
            <View style={styles.acao}><Botao titulo={feito ? 'Fechar' : 'Cancelar'} variante="secundario" onPress={fechar} desabilitado={baixando} /></View>
            <View style={styles.acao}><Botao titulo="Baixar" onPress={() => { void baixar(); }} carregando={baixando} desabilitado={!!analise.problema} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  fundo: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaco[5], backgroundColor: palco.veu },
  janela: {
    width: '100%', maxWidth: componentes.tela.larguraMaxFormulario, ...vidro(c, 'flutuante'), backgroundColor: c.flutuante,
    borderRadius: raio.grande, boxShadow: c.vidroSombra, padding: espaco[6], gap: espaco[4], overflow: 'hidden',
  },
  fio: { position: 'absolute', top: 0, left: raio.grande, right: raio.grande, height: 1, backgroundColor: c.vidroFio },
  titulo: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, lineHeight: entrelinha.titulo, color: c.texto },
  apoio: { fontFamily: fontes.texto, fontSize: corpo.legenda, lineHeight: entrelinha.base, color: c.textoSuave },

  horas: { flexDirection: 'row', gap: espaco[3] },
  campoCaixa: { flex: 1 },
  rotulo: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave, marginBottom: espaco[1.5] },
  campo: {
    ...vidro(c), borderRadius: componentes.campo.raio, fontFamily: fontes.nome, fontSize: corpo.titulo, color: c.texto,
    textAlign: 'center', paddingVertical: componentes.campo.respiroV, fontVariant: ['tabular-nums'], width: '100%',
  },

  atalhos: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espaco[2] },
  rotuloSolto: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave, marginRight: espaco[1] },
  chip: {
    borderRadius: raio.pilula, ...vidro(c), paddingHorizontal: espaco[3], minHeight: componentes.chip.altura,
    alignItems: 'center', justifyContent: 'center',
  },
  chipAtivo: { ...aceso(c), borderColor: c.luz },
  chipTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave },
  chipTextoAtivo: { color: c.sobreLuz },

  andamento: { gap: espaco[2.5] },
  andamentoTexto: { fontFamily: fontes.textoForte, fontSize: corpo.legenda, lineHeight: entrelinha.base, color: c.texto, fontVariant: ['tabular-nums'] },
  acoes: { flexDirection: 'row', gap: espaco[3], marginTop: espaco[1] },
  acao: { flex: 1 },
});
