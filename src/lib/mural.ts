import { api, ApiError } from '@/lib/api';
import { lerItem, salvarItem } from '@/lib/armazenamento';
import { localeAtual, tr } from '@/lib/idioma';

/**
 * Mural de avisos do condomínio (o síndico escreve, os moradores leem) e "meus acessos"
 * (o que a própria conta assistiu). Enquanto o servidor não tiver as rotas (404/405), as
 * buscas devolvem `null` e as telas mostram que o recurso ainda não chegou.
 */
export interface AvisoDoMural {
  id: number;
  condominio_id: number;
  condominio_nome: string | null;
  titulo: string;
  texto: string;
  autor_nome: string;
  criado_em: string;
  /** quem está lendo é síndico deste condomínio */
  pode_apagar: boolean;
}

export interface MeuAcesso {
  id: number;
  quando: string;
  acao: 'AO_VIVO' | 'GRAVACAO';
  camera_id: number;
  camera_nome: string | null;
  condominio_nome: string | null;
  neste_aparelho: boolean;
}

const semRota = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405);

export async function buscarMural(): Promise<AvisoDoMural[] | null> {
  try {
    return await api<AvisoDoMural[]>('/mural');
  } catch (e) {
    if (semRota(e)) return null;
    throw e;
  }
}

export function publicarAviso(condominioId: number, titulo: string, texto: string): Promise<AvisoDoMural> {
  return api<AvisoDoMural>('/mural', { method: 'POST', body: { condominio_id: condominioId, titulo, texto } });
}

export function tirarAviso(id: number): Promise<void> {
  return api<void>(`/mural/${id}`, { method: 'DELETE' });
}

export async function buscarMeusAcessos(): Promise<MeuAcesso[] | null> {
  try {
    return await api<MeuAcesso[]>('/meus-acessos');
  } catch (e) {
    if (semRota(e)) return null;
    throw e;
  }
}

// ── o que já foi lido: guardado neste aparelho (o maior número de aviso já aberto) ──
const CHAVE_VISTO = 'cmport_mural_visto';

export async function avisosNovos(avisos: AvisoDoMural[]): Promise<number> {
  const visto = Number(await lerItem(CHAVE_VISTO).catch(() => null)) || 0;
  return avisos.filter(a => a.id > visto).length;
}

export async function marcarMuralComoVisto(avisos: AvisoDoMural[]): Promise<void> {
  if (!avisos.length) return;
  await salvarItem(CHAVE_VISTO, String(Math.max(...avisos.map(a => a.id)))).catch(() => {});
}

/** "hoje 14:03", "ontem 09:10" ou "12/10 14:03". O servidor grava em UTC, sem fuso. */
export function quando(iso: string): string {
  const d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const hora = d.toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date();
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return tr('hoje {0}', [hora]);
  if (d.toDateString() === ontem.toDateString()) return tr('ontem {0}', [hora]);
  return `${d.toLocaleDateString(localeAtual(), { day: '2-digit', month: '2-digit' })} ${hora}`;
}
