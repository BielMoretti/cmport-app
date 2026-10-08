import { api } from './api';

/**
 * O resumo das últimas 24 horas de uma câmera, tirado da lista de trechos gravados
 * (GET /cameras/{id}/gravacoes): quanto gravou, quanto teve de movimento e em que horas,
 * quanto mandou para a nuvem e quanto ocupa no disco do servidor.
 *
 * A lista de um dia tem cerca de 1.400 trechos por câmera, então o resultado fica guardado
 * por meia hora e é compartilhado entre a aba Monitor e a barra da nuvem na Gestão.
 */
export interface Resumo24h {
  cameraId: number;
  minutosGravados: number;
  minutosComMovimento: number;
  /** minutos com movimento em cada uma das últimas 24 horas; o último é a hora atual */
  movimentoPorHora: number[];
  /** bytes que foram para a nuvem nessas 24 horas */
  bytesNaNuvem: number;
  /** o que a câmera ocupa agora no disco do servidor, e o teto dela */
  bytesEmDisco: number;
  limiteDeDisco: number;
}

interface Resposta {
  segmentos: { inicio: string; fim: string; tamanho_bytes: number; tem_movimento: boolean; na_nuvem: boolean }[];
  bytes_em_disco: number;
  limite_bytes: number;
}

const HORA = 3_600_000;
const VALIDADE_MS = 30 * 60_000;
const guardados = new Map<number, { em: number; resumo: Resumo24h }>();

// O backend trabalha em UTC sem fuso ("2026-10-04T14:03:00")
const lerUtc = (iso: string) => new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
const paraUtc = (data: Date) => data.toISOString().slice(0, 19);

export async function buscarResumo24h(cameraId: number, forcar = false): Promise<Resumo24h> {
  const guardado = guardados.get(cameraId);
  if (!forcar && guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.resumo;

  const ate = new Date();
  const de = new Date(ate.getTime() - 24 * HORA);
  const r = await api<Resposta>(`/cameras/${cameraId}/gravacoes?de=${paraUtc(de)}&ate=${paraUtc(ate)}`);

  const movimentoPorHora = new Array<number>(24).fill(0);
  let minutosGravados = 0;
  let minutosComMovimento = 0;
  let bytesNaNuvem = 0;
  for (const s of r.segmentos) {
    const inicio = lerUtc(s.inicio);
    const minutos = Math.max(0, (lerUtc(s.fim) - inicio) / 60_000);
    minutosGravados += minutos;
    if (s.na_nuvem) bytesNaNuvem += s.tamanho_bytes;
    if (s.tem_movimento) {
      minutosComMovimento += minutos;
      const horasAtras = Math.floor((ate.getTime() - inicio) / HORA);
      if (horasAtras >= 0 && horasAtras < 24) movimentoPorHora[23 - horasAtras] += minutos;
    }
  }
  const resumo: Resumo24h = {
    cameraId,
    minutosGravados: Math.round(minutosGravados),
    minutosComMovimento: Math.round(minutosComMovimento),
    movimentoPorHora: movimentoPorHora.map(Math.round),
    bytesNaNuvem,
    bytesEmDisco: r.bytes_em_disco,
    limiteDeDisco: r.limite_bytes,
  };
  guardados.set(cameraId, { em: Date.now(), resumo });
  return resumo;
}

/**
 * O resumo de várias câmeras, poucas por vez para não pesar no servidor. `aoAndar` recebe
 * os resumos prontos até ali, para a tela ir se preenchendo; câmera que falha fica de fora.
 */
export async function buscarResumos(cameraIds: number[], aoAndar?: (prontos: Resumo24h[]) => void, emParalelo = 3): Promise<Resumo24h[]> {
  const prontos: Resumo24h[] = [];
  for (let i = 0; i < cameraIds.length; i += emParalelo) {
    const lote = await Promise.all(cameraIds.slice(i, i + emParalelo).map(id => buscarResumo24h(id).catch(() => null)));
    for (const r of lote) if (r) prontos.push(r);
    aoAndar?.([...prontos]);
  }
  return prontos;
}
