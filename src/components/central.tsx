import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Pulso } from '@/components/efeitos';
import MarcaDagua from '@/components/MarcaDagua';
import { useEstilos, useTema } from '@/contexts/TemaContext';
import { urlAbsoluta } from '@/lib/config';
import { NUVEM_CONTRATADA_BYTES, tamanhoLegivel, type UsoDaNuvem as Uso } from '@/lib/nuvem';
import { estadoDe, type Estado } from '@/lib/saude';
import { componentes, corpo, entrelinha, espaco, fontes, palco, raio, type Paleta } from '@/lib/tema';
import type { Camera } from '@/lib/types';

/** Peças da Central: a parede de câmeras, a faixa de estado, os alertas e o relógio. */

const codigoDaCamera = (id: number) => `CAM ${String(id).padStart(2, '0')}`;

/** Relógio da central — hora do aparelho, atualizada a cada segundo. */
export function Relogio() {
  const styles = useEstilos(criarEstilos);
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Text style={styles.relogio} accessibilityLabel="Hora atual">
      {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </Text>
  );
}

/**
 * Um monitor da parede: a imagem mais recente da câmera (o servidor renova a cada
 * ~30 s), com o código, o nome e o estado por cima — como numa central de CFTV.
 */
export function Monitor({ camera, onPress, grande = false }: { camera: Camera; onPress: () => void; grande?: boolean }) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const estado = estadoDe(camera);
  const foto = urlAbsoluta(camera.miniatura_url);
  const atencao = camera.saude === 'ATENCAO' || camera.saude === 'PROBLEMA';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${camera.nome}, ${estado === 'online' ? 'ao vivo' : estado === 'offline' ? 'fora do ar' : 'sem informação'}. Abrir.`}
      style={({ pressed }) => [styles.monitor, estado === 'offline' && styles.monitorOffline, pressed && styles.monitorPressionado]}
    >
      {foto ? (
        <>
          <Image source={{ uri: foto }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          <MarcaDagua tamanho={grande ? 'grande' : 'pequena'} />
        </>
      ) : (
        <View style={styles.semSinal}>
          <Text style={styles.semSinalTexto}>{estado === 'offline' ? 'Sem sinal' : 'Sem imagem'}</Text>
        </View>
      )}
      <View style={styles.tarja}>
        <Text style={styles.codigo}>{codigoDaCamera(camera.id)}</Text>
        <Text style={styles.nomeNoMonitor} numberOfLines={1}>{camera.nome}</Text>
      </View>

      <View style={styles.selo}>
        {estado === 'online' ? <Pulso cor={cores.estadoOnline} tamanho={componentes.selo.ponto} /> : (
          <View style={[styles.ponto, { backgroundColor: estado === 'offline' ? cores.estadoOffline : cores.estadoNeutro }]} />
        )}
        <Text style={styles.seloTexto}>{estado === 'online' ? 'Ao vivo' : estado === 'offline' ? 'Offline' : 'Sem info'}</Text>
      </View>

      {atencao && (
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>{camera.saude === 'PROBLEMA' ? 'Vídeo com problema' : 'Vídeo instável'}</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Faixa de estado: a proporção de câmeras online, offline e sem informação.
 * Cada parte tem rótulo e número ao lado — a cor nunca é a única pista.
 */
export function FaixaDeEstado({ cameras }: { cameras: Camera[] }) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const conta: Record<Estado, number> = { online: 0, offline: 0, desconhecido: 0 };
  for (const c of cameras) conta[estadoDe(c)] += 1;
  const partes: { estado: Estado; rotulo: string; cor: string }[] = [
    { estado: 'online', rotulo: 'Online', cor: cores.estadoOnline },
    { estado: 'offline', rotulo: 'Offline', cor: cores.estadoOffline },
    { estado: 'desconhecido', rotulo: 'Sem informação', cor: cores.estadoNeutro },
  ];
  if (cameras.length === 0) return null;

  return (
    <View
      style={styles.faixaBloco}
      accessibilityRole="image"
      accessibilityLabel={`De ${cameras.length} câmeras: ${conta.online} online, ${conta.offline} offline, ${conta.desconhecido} sem informação.`}
    >
      <View style={styles.faixa}>
        {partes.filter(p => conta[p.estado] > 0).map(p => (
          <View key={p.estado} style={[styles.faixaParte, { flex: conta[p.estado], backgroundColor: p.cor }]} />
        ))}
      </View>
      <View style={styles.legenda}>
        {partes.map(p => (
          <View key={p.estado} style={styles.legendaItem}>
            <View style={[styles.ponto, { backgroundColor: p.cor }]} />
            <Text style={styles.legendaTexto}>{p.rotulo}</Text>
            <Text style={styles.legendaNumero}>{conta[p.estado]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface Alerta {
  chave: string;
  grave: boolean;
  titulo: string;
  detalhe: string;
  aoTocar: () => void;
}

/** Alertas da central — só o que pede ação agora, tirado do estado real das câmeras. */
export function Alertas({ alertas }: { alertas: Alerta[] }) {
  const styles = useEstilos(criarEstilos);
  if (alertas.length === 0) {
    return (
      <View style={styles.tudoCerto}>
        <Text style={styles.tudoCertoTexto}>Nenhum alerta. Todas as câmeras consultadas estão no ar.</Text>
      </View>
    );
  }
  return (
    <View style={styles.alertas}>
      {alertas.map(a => (
        <Pressable
          key={a.chave}
          onPress={a.aoTocar}
          accessibilityRole="button"
          accessibilityLabel={`${a.grave ? 'Alerta grave' : 'Atenção'}: ${a.titulo}. ${a.detalhe}`}
          style={({ pressed }) => [styles.alerta, a.grave && styles.alertaGrave, pressed && styles.alertaPressionado]}
        >
          <View style={[styles.alertaBarra, a.grave && styles.alertaBarraGrave]} />
          <View style={styles.alertaTexto}>
            <Text style={styles.alertaTitulo} numberOfLines={1}>{a.titulo}</Text>
            <Text style={styles.alertaDetalhe} numberOfLines={1}>{a.detalhe}</Text>
          </View>
          <Text style={[styles.alertaNivel, a.grave && styles.alertaNivelGrave]}>{a.grave ? 'Grave' : 'Atenção'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Barra de uso (ex.: espaço de gravação): preenchido / total, com o valor escrito ao lado. */
export function Medidor({ fracao, rotulo }: { fracao: number; rotulo: string }) {
  const styles = useEstilos(criarEstilos);
  const f = Math.max(0, Math.min(1, fracao));
  return (
    <View style={styles.medidorBloco} accessibilityRole="progressbar" accessibilityLabel={rotulo} accessibilityValue={{ min: 0, max: 100, now: Math.round(f * 100) }}>
      <View style={styles.medidorTrilho}>
        <View style={[styles.medidorCheio, { width: `${Math.max(f * 100, 2)}%` }]} />
      </View>
      <Text style={styles.medidorRotulo}>{rotulo}</Text>
    </View>
  );
}

/**
 * Quanto as gravações ocupam na nuvem, do espaço contratado: a barra enche com o que
 * cada plano (7, 14 e 30 dias) ocupa e o resto do trilho é o que ainda está livre.
 * Cada parte tem nome e valor escritos — a cor nunca é a única pista.
 */
export function UsoDaNuvem({ uso, falhou = false }: { uso: Uso | null; falhou?: boolean }) {
  const styles = useEstilos(criarEstilos);
  const { cores } = useTema();
  const corDoPlano: Record<number, string> = { 7: cores.ciano, 14: cores.luz, 30: cores.texto };

  if (falhou) return <Text style={styles.nuvemApoio}>Não foi possível calcular o uso da nuvem agora.</Text>;
  if (!uso) {
    return (
      <View style={styles.nuvem} accessibilityLabel="Calculando o uso da nuvem">
        <Text style={styles.nuvemRotulo}>Gravações na nuvem</Text>
        <Text style={styles.nuvemApoio}>Calculando…</Text>
        <View style={styles.nuvemBarraVazia} />
      </View>
    );
  }

  const partes = uso.porPlano.filter(p => p.bytes > 0);
  const livre = NUVEM_CONTRATADA_BYTES - uso.total;
  const porcento = Math.round((uso.total / NUVEM_CONTRATADA_BYTES) * 100);
  const apertado = porcento >= 90;
  return (
    <View
      style={styles.nuvem}
      accessibilityRole="image"
      accessibilityLabel={`Gravações na nuvem: cerca de ${tamanhoLegivel(uso.total)} de ${tamanhoLegivel(NUVEM_CONTRATADA_BYTES)} contratados, ${porcento} por cento. ${partes.map(p => `Plano de ${p.dias} dias: ${tamanhoLegivel(p.bytes)}`).join('. ')}`}
    >
      <Text style={styles.nuvemRotulo}>Gravações na nuvem</Text>
      <View style={styles.nuvemTotalLinha}>
        <Text style={styles.nuvemTotal}>{tamanhoLegivel(uso.total)}</Text>
        <Text style={styles.nuvemApoio}>de {tamanhoLegivel(NUVEM_CONTRATADA_BYTES)}, estimado</Text>
      </View>

      {partes.length === 0 ? (
        <>
          <View style={styles.nuvemBarraVazia} />
          <Text style={styles.nuvemApoio}>Nenhuma gravação foi para a nuvem nas últimas 24 horas.</Text>
        </>
      ) : (
        <>
          <View style={styles.nuvemBarra}>
            {partes.map(p => <View key={p.dias} style={[styles.nuvemParte, { flex: p.bytes, backgroundColor: corDoPlano[p.dias] ?? cores.estadoNeutro }]} />)}
            {/* o que sobra do contratado */}
            {livre > 0 && <View style={[styles.nuvemParte, styles.nuvemLivre, { flex: livre }]} />}
          </View>
          <Text style={[styles.nuvemSituacao, apertado && styles.nuvemSituacaoApertada]}>
            {livre > 0
              ? `${porcento}% usado, ${tamanhoLegivel(livre)} livres${apertado ? '. O espaço está acabando.' : ''}`
              : `Passou do contratado em ${tamanhoLegivel(-livre)}.`}
          </Text>
          <View style={styles.legenda}>
            {partes.map(p => (
              <View key={p.dias} style={styles.legendaItem}>
                <View style={[styles.ponto, { backgroundColor: corDoPlano[p.dias] ?? cores.estadoNeutro }]} />
                <Text style={styles.legendaTexto}>Plano de {p.dias} dias</Text>
                <Text style={styles.legendaNumero}>{tamanhoLegivel(p.bytes)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      {uso.consultadas < uso.esperadas && (
        <Text style={styles.nuvemApoio}>{uso.esperadas - uso.consultadas} de {uso.esperadas} câmeras não responderam e ficaram fora da conta.</Text>
      )}
    </View>
  );
}

const criarEstilos = (c: Paleta) => StyleSheet.create({
  nuvem: { gap: espaco[2] },
  nuvemRotulo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
  nuvemTotalLinha: { flexDirection: 'row', alignItems: 'baseline', gap: espaco[2] },
  nuvemTotal: { fontFamily: fontes.nome, fontSize: componentes.estatistica.numero, lineHeight: componentes.estatistica.numero + espaco[1], color: c.texto, fontVariant: ['tabular-nums'] },
  nuvemApoio: { fontFamily: fontes.texto, fontSize: corpo.pequeno, lineHeight: entrelinha.base, color: c.textoSuave },
  // partes separadas por um vão: a divisão não depende só da cor
  nuvemBarra: { flexDirection: 'row', height: componentes.faixaDeEstado.altura, gap: espaco[0.5] },
  nuvemParte: { borderRadius: raio.pilula, minWidth: espaco[1.5] },
  nuvemLivre: { backgroundColor: c.linha },
  nuvemSituacao: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.texto, fontVariant: ['tabular-nums'] },
  nuvemSituacaoApertada: { color: c.erro },
  nuvemBarraVazia: { height: componentes.faixaDeEstado.altura, borderRadius: raio.pilula, backgroundColor: c.linha },

  relogio: { fontFamily: fontes.nome, fontSize: corpo.cabecalho, color: c.texto, fontVariant: ['tabular-nums'] },

  monitor: {
    aspectRatio: 16 / 9, backgroundColor: palco.fundo, borderRadius: raio.medio, overflow: 'hidden',
    borderWidth: 1, borderColor: c.linha,
  },
  monitorOffline: { borderColor: c.estadoOffline },
  monitorPressionado: { borderColor: c.luz, boxShadow: c.brilho },
  semSinal: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.predio },
  semSinalTexto: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.textoSuave },
  tarja: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: espaco[2],
    backgroundColor: palco.veu, paddingHorizontal: espaco[2], paddingVertical: espaco[1],
  },
  codigo: { fontFamily: fontes.nome, fontSize: corpo.micro, color: palco.texto, opacity: 0.75 },
  nomeNoMonitor: { flex: 1, fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: palco.texto },
  selo: {
    position: 'absolute', top: espaco[1.5], right: espaco[1.5], flexDirection: 'row', alignItems: 'center', gap: espaco[1],
    backgroundColor: palco.veu, borderRadius: componentes.selo.raio, paddingHorizontal: espaco[1.5], paddingVertical: espaco[0.5],
  },
  seloTexto: { fontFamily: fontes.textoForte, fontSize: corpo.micro, color: palco.texto },
  ponto: { width: componentes.selo.ponto, height: componentes.selo.ponto, borderRadius: componentes.selo.ponto / 2 },
  aviso: {
    position: 'absolute', top: espaco[1.5], left: espaco[1.5], backgroundColor: palco.veu, borderRadius: componentes.selo.raio,
    borderWidth: 1, borderColor: c.estadoOffline, paddingHorizontal: espaco[1.5], paddingVertical: espaco[0.5],
  },
  avisoTexto: { fontFamily: fontes.textoForte, fontSize: corpo.micro, color: palco.texto },

  faixaBloco: { gap: espaco[2] },
  // partes separadas por um vão da cor do fundo, pra não depender só da cor
  faixa: { flexDirection: 'row', height: componentes.faixaDeEstado.altura, gap: espaco[0.5] },
  faixaParte: { borderRadius: raio.pequeno },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', columnGap: espaco[4], rowGap: espaco[1] },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: espaco[1.5] },
  legendaTexto: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
  legendaNumero: { fontFamily: fontes.nome, fontSize: corpo.base, color: c.texto },

  alertas: { gap: espaco[2] },
  alerta: {
    flexDirection: 'row', alignItems: 'center', gap: espaco[3], minHeight: componentes.linha.alturaMin, paddingRight: espaco[3],
    backgroundColor: c.superficie, borderRadius: raio.medio, borderWidth: 1, borderColor: c.linha, overflow: 'hidden',
  },
  alertaGrave: { borderColor: c.estadoOffline },
  alertaPressionado: { boxShadow: c.brilho },
  alertaBarra: { width: componentes.poste.trilho, alignSelf: 'stretch', backgroundColor: c.luz },
  alertaBarraGrave: { backgroundColor: c.estadoOffline },
  alertaTexto: { flex: 1, paddingVertical: espaco[2], gap: espaco[0.5] },
  alertaTitulo: { fontFamily: fontes.textoForte, fontSize: corpo.base, color: c.texto },
  alertaDetalhe: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
  alertaNivel: { fontFamily: fontes.textoForte, fontSize: corpo.pequeno, color: c.azul },
  alertaNivelGrave: { color: c.erro },
  tudoCerto: { backgroundColor: c.superficie, borderRadius: raio.medio, borderWidth: 1, borderColor: c.linha, padding: espaco[3] },
  tudoCertoTexto: { fontFamily: fontes.texto, fontSize: corpo.base, lineHeight: entrelinha.base, color: c.textoSuave },

  medidorBloco: { gap: espaco[1] },
  medidorTrilho: { height: componentes.medidor.altura, borderRadius: raio.pequeno, backgroundColor: c.linha, overflow: 'hidden' },
  medidorCheio: { height: '100%', borderRadius: raio.pequeno, backgroundColor: c.luz },
  medidorRotulo: { fontFamily: fontes.texto, fontSize: corpo.pequeno, color: c.textoSuave },
});
