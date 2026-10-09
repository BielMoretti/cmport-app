import { api } from './api';
import { urlAbsoluta } from './config';

/**
 * Gravações de uma câmera — contrato real do backend (camera_router.py, gravacao_schema.py):
 * - GET  /cameras/{id}/gravacoes?de=&ate=   trechos de ~1 min no período (UTC, máx. 7 dias)
 * - POST /cameras/{id}/playback {segmento_id} → link temporário (5 min) que toca sem login
 */
export interface Trecho {
  id: number;
  inicio: Date;
  fim: Date;
  movimento: boolean;
  /** imagem do minuto com movimento; null se não teve movimento */
  miniaturaUrl: string | null;
  /** false = o arquivo já saiu do servidor e não está na nuvem: não dá pra assistir */
  disponivel: boolean;
}

interface SegmentoDaApi {
  id: number;
  inicio: string;
  fim: string;
  tem_movimento: boolean;
  // o serviço de cliente não manda onde o arquivo está nem a miniatura
  no_local?: boolean;
  na_nuvem?: boolean;
  miniatura_url?: string | null;
}

// O backend trabalha em UTC sem fuso ("2026-10-04T14:03:00"); sem o Z o aparelho leria como hora local
const lerUtc = (iso: string) => new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
const paraUtc = (data: Date) => data.toISOString().slice(0, 19);

/** Trechos gravados num dia do calendário do aparelho (00:00 às 23:59, hora local). */
export async function buscarGravacoes(cameraId: number, dia: Date): Promise<Trecho[]> {
  const de = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  const ate = new Date(de.getTime() + 24 * 60 * 60 * 1000);
  const resposta = await api<{ segmentos: SegmentoDaApi[] }>(
    `/cameras/${cameraId}/gravacoes?de=${paraUtc(de)}&ate=${paraUtc(ate)}`,
  );
  return resposta.segmentos
    .map(s => ({
      id: s.id,
      inicio: lerUtc(s.inicio),
      fim: lerUtc(s.fim),
      movimento: s.tem_movimento,
      miniaturaUrl: urlAbsoluta(s.miniatura_url),
      // sem a informação de onde o arquivo está, o trecho listado é tratado como disponível
      disponivel: s.no_local === undefined && s.na_nuvem === undefined ? true : !!(s.no_local || s.na_nuvem),
    }))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Pede ao servidor o link temporário do vídeo de um trecho. */
export async function pedirVideo(cameraId: number, trechoId: number): Promise<string> {
  const { url } = await api<{ url: string }>(`/cameras/${cameraId}/playback`, {
    method: 'POST',
    body: { segmento_id: trechoId },
  });
  return urlAbsoluta(url)!;
}

export interface UsoDeDisco {
  usado: number;   // bytes de gravação desta câmera no servidor
  limite: number;  // teto por câmera configurado no servidor
}

/**
 * Quanto do espaço de gravação a câmera ocupa. O backend devolve isso junto com a
 * linha do tempo; pedimos só o último minuto pra não trazer a lista inteira de trechos.
 */
export async function buscarUsoDeDisco(cameraId: number): Promise<UsoDeDisco> {
  const ate = new Date();
  const de = new Date(ate.getTime() - 60_000);
  const r = await api<{ bytes_em_disco: number; limite_bytes: number }>(
    `/cameras/${cameraId}/gravacoes?de=${paraUtc(de)}&ate=${paraUtc(ate)}`,
  );
  return { usado: r.bytes_em_disco, limite: r.limite_bytes };
}

/** Um movimento: minutos seguidos com movimento contam como um evento só. */
export interface Evento {
  inicio: Date;
  fim: Date;
  minutos: number;
  /** o primeiro trecho — é dele a miniatura e é por ele que o evento começa a tocar */
  primeiro: Trecho;
}

export function agruparEventos(trechos: Trecho[]): Evento[] {
  const eventos: Evento[] = [];
  for (const t of trechos) {
    if (!t.movimento) continue;
    const ultimo = eventos[eventos.length - 1];
    // emenda se este trecho começa até 5 s depois do fim do anterior
    if (ultimo && t.inicio.getTime() - ultimo.fim.getTime() <= 5000) {
      ultimo.fim = t.fim;
      ultimo.minutos += 1;
    } else {
      eventos.push({ inicio: t.inicio, fim: t.fim, minutos: 1, primeiro: t });
    }
  }
  return eventos;
}
