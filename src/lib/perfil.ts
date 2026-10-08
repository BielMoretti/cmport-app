import { podeGerenciarUsuarios } from './acesso';
import { api, ApiError } from './api';
import { lerItem, salvarItem } from './armazenamento';
import type { Role } from './types';

/**
 * O perfil de quem está logado ("Minha conta"): nome, como quer ser chamado, telefone,
 * nascimento e unidade.
 *
 * Contrato do servidor (proposta de backend, em cmport-backend-proposta):
 *   GET   /auth/me   → devolve também apelido, telefone, data_nascimento e unidade
 *   PATCH /auth/me   → o próprio usuário edita esses campos e o nome
 *
 * Enquanto a proposta não estiver publicada, o servidor não conhece esses campos. Aí os
 * dados ficam guardados só neste aparelho (e a tela avisa), e o nome só muda para quem já
 * pode editar usuários, pela rota que existe hoje.
 */
export interface Perfil {
  id: number;
  nome: string;
  email: string;
  role: Role;
  apelido: string;
  telefone: string;          // só dígitos
  dataNascimento: string;    // AAAA-MM-DD, ou vazio
  unidade: string;
}

export type CamposDoPerfil = Pick<Perfil, 'nome' | 'apelido' | 'telefone' | 'dataNascimento' | 'unidade'>;

interface RespostaDoServidor {
  id: number;
  nome: string;
  email: string;
  role: Role;
  apelido?: string | null;
  telefone?: string | null;
  data_nascimento?: string | null;
  unidade?: string | null;
}

type Extras = Pick<Perfil, 'apelido' | 'telefone' | 'dataNascimento' | 'unidade'>;
const SEM_EXTRAS: Extras = { apelido: '', telefone: '', dataNascimento: '', unidade: '' };
const chaveLocal = (id: number) => `cmport_perfil_${id}`;

async function lerLocal(id: number): Promise<Extras> {
  try {
    const salvo = await lerItem(chaveLocal(id));
    return salvo ? { ...SEM_EXTRAS, ...(JSON.parse(salvo) as Partial<Extras>) } : SEM_EXTRAS;
  } catch {
    return SEM_EXTRAS;
  }
}

/** O servidor já conhece os campos do perfil? (a resposta traz a chave, mesmo que nula) */
const servidorTemPerfil = (r: RespostaDoServidor) => 'apelido' in r;

function montar(r: RespostaDoServidor, extras: Extras): Perfil {
  return { id: r.id, nome: r.nome, email: r.email, role: r.role, ...extras };
}

export async function buscarPerfil(): Promise<{ perfil: Perfil; noServidor: boolean }> {
  const r = await api<RespostaDoServidor>('/auth/me');
  if (servidorTemPerfil(r)) {
    return {
      noServidor: true,
      perfil: montar(r, { apelido: r.apelido ?? '', telefone: r.telefone ?? '', dataNascimento: r.data_nascimento ?? '', unidade: r.unidade ?? '' }),
    };
  }
  return { noServidor: false, perfil: montar(r, await lerLocal(r.id)) };
}

export interface ResultadoDeSalvar {
  perfil: Perfil;
  /** onde os dados ficaram guardados */
  onde: 'servidor' | 'aparelho';
  /** o nome foi pedido mas não pôde ser trocado (servidor antigo e nível sem permissão) */
  nomeNaoMudou: boolean;
}

export async function salvarPerfil(atual: Perfil, novo: CamposDoPerfil): Promise<ResultadoDeSalvar> {
  try {
    const r = await api<RespostaDoServidor>('/auth/me', {
      method: 'PATCH',
      body: {
        nome: novo.nome.trim(),
        apelido: novo.apelido.trim(),
        telefone: novo.telefone,
        data_nascimento: novo.dataNascimento || null,
        unidade: novo.unidade.trim(),
      },
    });
    // só vale como "salvo no servidor" se a resposta trouxer os campos de volta
    if (servidorTemPerfil(r)) {
      const perfil = montar(r, { apelido: r.apelido ?? '', telefone: r.telefone ?? '', dataNascimento: r.data_nascimento ?? '', unidade: r.unidade ?? '' });
      return { perfil, onde: 'servidor', nomeNaoMudou: false };
    }
  } catch (e) {
    // 404/405 = o servidor ainda não tem a rota: guarda neste aparelho
    if (!(e instanceof ApiError && (e.status === 404 || e.status === 405))) throw e;
  }

  const extras: Extras = { apelido: novo.apelido.trim(), telefone: novo.telefone, dataNascimento: novo.dataNascimento, unidade: novo.unidade.trim() };
  await salvarItem(chaveLocal(atual.id), JSON.stringify(extras));

  let nome = atual.nome;
  let nomeNaoMudou = false;
  if (novo.nome.trim() !== atual.nome) {
    if (podeGerenciarUsuarios(atual.role)) {
      nome = (await api<{ nome: string }>(`/usuarios/${atual.id}`, { method: 'PATCH', body: { nome: novo.nome.trim() } })).nome;
    } else {
      nomeNaoMudou = true;
    }
  }
  return { perfil: { ...atual, nome, ...extras }, onde: 'aparelho', nomeNaoMudou };
}

// ───────────────────────── formatação dos campos ─────────────────────────

/** "11988887777" → "(11) 98888-7777", também no meio da digitação. */
export function formatarTelefone(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** "17051990" → "17/05/1990", também no meio da digitação. */
export function formatarDataDigitada(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "17/05/1990" → "1990-05-17". Vazio se incompleta; null se a data não existe ou não faz sentido. */
export function dataParaIso(texto: string): string | null {
  if (texto.trim() === '') return '';
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  if (ano < 1900 || data.getTime() > Date.now()) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export const isoParaData = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** Idade em anos completos, a partir de "AAAA-MM-DD". */
export function idadeDe(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const hoje = new Date();
  const [ano, mes, dia] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  let idade = hoje.getFullYear() - ano;
  if (hoje.getMonth() + 1 < mes || (hoje.getMonth() + 1 === mes && hoje.getDate() < dia)) idade--;
  return idade >= 0 ? idade : null;
}
