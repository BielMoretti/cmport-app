import { cabecalhosDoAparelho, prepararAparelho } from './aparelho';
import { API_URL } from './config';
import { arrumarNomes } from './texto';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let token: string | null = null;
let aoExpirar: (() => void) | null = null;

export function setToken(novo: string | null) {
  token = novo;
}

/** Chamado quando o backend responde 401 numa rota autenticada (token expirou — dura 8h). */
export function setAoExpirar(fn: (() => void) | null) {
  aoExpirar = fn;
}

function mensagemDeErro(status: number, corpo: unknown): string {
  const detail = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (status >= 500) return 'Servidor indisponível. Tente novamente.';
  return `Erro ${status}.`;
}

// redirect_slashes=False no backend — nunca mandar barra no final do path (dá 404)
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  // a identidade do aparelho vai em todo pedido: é o que o servidor confere no login preso a um aparelho
  await prepararAparelho();
  const headers: Record<string, string> = { Accept: 'application/json', ...cabecalhosDoAparelho() };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }

  const corpo: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && token) aoExpirar?.();
    throw new ApiError(res.status, mensagemDeErro(res.status, corpo));
  }
  // nomes de condomínio chegam em MAIÚSCULAS; aqui viram texto normal (ver lib/texto.ts)
  return arrumarNomes(corpo) as T;
}
