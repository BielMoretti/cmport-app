import { api } from './api';

/**
 * Situação da conexão de uma câmera (online/offline).
 *
 * ATENÇÃO — contrato NÃO confirmado. Produção tem a rota GET /cameras/{id}/saude
 * (responde 401 sem login), mas o código dela não está na cópia local do
 * cmport-system. Os nomes de campo abaixo são SUPOSIÇÃO. Se o formato for outro,
 * tudo vira "desconhecido" e as telas mostram "sem informação" — nada quebra.
 * Quando o contrato real chegar, só este arquivo muda.
 */
export type Estado = 'online' | 'offline' | 'desconhecido';

function interpretar(resposta: unknown): Estado {
  if (!resposta || typeof resposta !== 'object') return 'desconhecido';
  const r = resposta as Record<string, unknown>;
  for (const campo of ['online', 'conectada', 'publicando']) {
    if (typeof r[campo] === 'boolean') return r[campo] ? 'online' : 'offline';
  }
  if (typeof r.status === 'string') {
    const s = r.status.toUpperCase();
    if (['ONLINE', 'OK', 'CONECTADA'].includes(s)) return 'online';
    if (['OFFLINE', 'DESCONECTADA', 'SEM_SINAL'].includes(s)) return 'offline';
  }
  return 'desconhecido';
}

export async function buscarEstado(cameraId: number): Promise<Estado> {
  try {
    return interpretar(await api<unknown>(`/cameras/${cameraId}/saude`));
  } catch {
    return 'desconhecido';
  }
}

/** Estado de várias câmeras de uma vez, poucas requisições por vez (a VPS é pequena). */
export async function buscarEstados(ids: number[], porVez = 4): Promise<Map<number, Estado>> {
  const mapa = new Map<number, Estado>();
  for (let i = 0; i < ids.length; i += porVez) {
    const lote = ids.slice(i, i + porVez);
    const estados = await Promise.all(lote.map(buscarEstado));
    lote.forEach((id, j) => mapa.set(id, estados[j]));
  }
  return mapa;
}

export const ROTULO_DO_ESTADO: Record<Estado, string> = {
  online: 'Online',
  offline: 'Offline',
  desconhecido: 'Sem informação',
};
