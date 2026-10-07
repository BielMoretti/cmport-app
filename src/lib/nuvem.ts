import { buscarBytesNaNuvem } from './gravacoes';
import type { Camera } from './types';

/**
 * Quanto as gravações ocupam na nuvem.
 *
 * O backend não tem uma rota que devolva esse total. O que ele entrega, por câmera, é a
 * lista de trechos com o tamanho de cada um e se está na nuvem. Somar todos os trechos de
 * todas as câmeras pelo prazo inteiro (até 30 dias) traria dezenas de megabytes de lista
 * só para desenhar uma barra, então o número aqui é uma ESTIMATIVA:
 *
 *   o que cada câmera mandou para a nuvem nas últimas 24 h  ×  os dias do plano dela
 *
 * Vale para câmera que já grava há mais tempo que o plano; uma câmera recém-ligada aparece
 * com mais do que realmente ocupa. O valor exato é uma soma simples no banco do servidor
 * (tamanho dos trechos com cópia na nuvem ainda no prazo) — quando existir a rota, troca-se aqui.
 */
export interface UsoPorPlano {
  dias: number;      // prazo do plano: 7, 14 ou 30
  bytes: number;
  cameras: number;
}

export interface UsoDaNuvem {
  total: number;
  porPlano: UsoPorPlano[];
  /** câmeras que responderam, de quantas foram consultadas */
  consultadas: number;
  esperadas: number;
  /** quando a conta foi feita */
  em: Date;
}

/** Espaço contratado na nuvem para as gravações (informado pelo cliente em 2026-10-05). Mudou o contrato, muda aqui. */
export const NUVEM_CONTRATADA_BYTES = 500 * 1024 ** 3;

const VALIDADE_MS = 30 * 60_000;   // a conta é cara (uma lista de 24 h por câmera): vale por meia hora
const EM_PARALELO = 3;

let guardado: { chave: string; uso: UsoDaNuvem } | null = null;

export async function buscarUsoDaNuvem(cameras: Camera[], forcar = false): Promise<UsoDaNuvem> {
  const ativas = cameras.filter(c => c.ativo);
  const chave = ativas.map(c => `${c.id}:${c.dias_retencao}`).sort().join(',');
  if (!forcar && guardado && guardado.chave === chave && Date.now() - guardado.uso.em.getTime() < VALIDADE_MS) return guardado.uso;

  const planos = new Map<number, UsoPorPlano>();
  let consultadas = 0;
  for (let i = 0; i < ativas.length; i += EM_PARALELO) {
    const lote = ativas.slice(i, i + EM_PARALELO);
    const respostas = await Promise.all(lote.map(c => buscarBytesNaNuvem(c.id).catch(() => null)));
    lote.forEach((c, j) => {
      const ultimoDia = respostas[j];
      if (ultimoDia === null) return;
      consultadas++;
      const plano = planos.get(c.dias_retencao) ?? { dias: c.dias_retencao, bytes: 0, cameras: 0 };
      planos.set(c.dias_retencao, { ...plano, bytes: plano.bytes + ultimoDia * c.dias_retencao, cameras: plano.cameras + 1 });
    });
  }
  if (ativas.length > 0 && consultadas === 0) throw new Error('Não foi possível consultar as gravações na nuvem.');

  const porPlano = [...planos.values()].sort((a, b) => a.dias - b.dias);
  const uso: UsoDaNuvem = { total: porPlano.reduce((s, p) => s + p.bytes, 0), porPlano, consultadas, esperadas: ativas.length, em: new Date() };
  guardado = { chave, uso };
  return uso;
}

/** "128,4 GB", "3,2 TB" ou "640 MB" — o tamanho na unidade que lê melhor. */
export function tamanhoLegivel(bytes: number): string {
  const GB = 1024 ** 3;
  if (bytes >= 1024 * GB) return `${(bytes / (1024 * GB)).toFixed(2).replace('.', ',')} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1).replace('.', ',')} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
