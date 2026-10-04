import { api } from './api';
import { API_URL } from './config';

/**
 * Gravações de uma câmera.
 *
 * ATENÇÃO — contrato ainda NÃO confirmado. O que se sabe (04/10/2026):
 * - produção tem a rota GET /cameras/{id}/gravacoes (responde 401 sem login);
 * - o MediaMTX grava trechos de ~1 minuto e um worker marca os que tiveram movimento;
 * - o vídeo sai por um link temporário assinado.
 * O formato da resposta e os parâmetros abaixo são uma SUPOSIÇÃO, porque o código
 * dessa parte não está na cópia local do cmport-system. Quando o contrato real
 * estiver em mãos, só este arquivo muda — a tela usa apenas `Trecho`.
 */
export interface Trecho {
  inicio: Date;
  duracaoSeg: number;
  movimento: boolean;
  /** Link do vídeo do trecho; null se o servidor não mandar. */
  url: string | null;
}

/** O servidor respondeu, mas num formato que este adaptador não reconhece. */
export class FormatoDesconhecido extends Error {}

function diaISO(dia: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dia.getFullYear()}-${p(dia.getMonth() + 1)}-${p(dia.getDate())}`;
}

function lerData(valor: unknown): Date | null {
  if (typeof valor !== 'string') return null;
  // O backend grava horários em UTC sem fuso ("2026-10-04T14:03:00") — sem o Z o
  // aparelho leria como horário local
  const comFuso = /Z$|[+-]\d\d:?\d\d$/.test(valor) ? valor : `${valor}Z`;
  const data = new Date(comFuso);
  return Number.isNaN(data.getTime()) ? null : data;
}

function lerUrl(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor) return null;
  if (/^https?:\/\//.test(valor)) return valor;
  // caminho relativo ("/api/v1/gravacoes/video?...") — completa com o endereço do servidor
  return new URL(API_URL).origin + (valor.startsWith('/') ? valor : `/${valor}`);
}

export async function buscarGravacoes(cameraId: number, dia: Date): Promise<Trecho[]> {
  const resposta = await api<unknown>(`/cameras/${cameraId}/gravacoes?dia=${diaISO(dia)}`);

  const bruto = Array.isArray(resposta)
    ? resposta
    : (resposta as Record<string, unknown> | null)?.segmentos ?? (resposta as Record<string, unknown> | null)?.gravacoes;
  if (!Array.isArray(bruto)) throw new FormatoDesconhecido();

  const trechos = bruto.map((item): Trecho => {
    const r = item as Record<string, unknown>;
    const inicio = lerData(r.inicio ?? r.inicio_utc);
    if (!inicio) throw new FormatoDesconhecido();
    return {
      inicio,
      duracaoSeg: typeof r.duracao_segundos === 'number' ? r.duracao_segundos : 60,
      movimento: Boolean(r.movimento ?? r.tem_movimento),
      url: lerUrl(r.url ?? r.video_url),
    };
  });

  // Garante só o dia pedido (no horário do aparelho), mesmo que o servidor mande mais
  return trechos
    .filter(t => diaISO(t.inicio) === diaISO(dia))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}
