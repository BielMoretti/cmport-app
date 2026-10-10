import { cabecalhosDoAparelho, prepararAparelho } from './aparelho';
import { API_URL } from './config';
import { arrumarNomes } from './texto';
import { idiomaAtual, tr, trDoServidor } from '@/lib/idioma';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** O que o servidor devolve no login e na renovação. */
export interface RespostaDeSessao {
  access_token: string;
  token_type: string;
  role: string;
  nome: string;
  precisa_trocar_senha?: boolean;
}

let token: string | null = null;
let aoExpirar: (() => void) | null = null;
let aoRenovar: ((nova: RespostaDeSessao) => void) | null = null;
let aoExigirTroca: (() => void) | null = null;

/**
 * Chamado quando o servidor recusa um pedido porque a senha ainda é a provisória
 * (403 "Troque a senha provisória para continuar."). Garante que a janela de criar a
 * senha apareça mesmo que o aviso do login tenha se perdido.
 */
export function setAoExigirTroca(fn: (() => void) | null) {
  aoExigirTroca = fn;
}

export function setToken(novo: string | null) {
  token = novo;
}

/** Chamado quando a sessão acabou de vez: o token venceu e a renovação foi recusada. */
export function setAoExpirar(fn: (() => void) | null) {
  aoExpirar = fn;
}

/** Chamado quando o token foi trocado por um novo, para quem guarda a sessão gravá-lo. */
export function setAoRenovar(fn: ((nova: RespostaDeSessao) => void) | null) {
  aoRenovar = fn;
}

// como o servidor chama os campos → como o app os chama na tela
const NOME_DO_CAMPO: Record<string, string> = {
  nome: 'Nome', email: 'Email', cpf: 'CPF', senha: 'Senha', unidade: 'Unidade', telefone: 'Telefone',
  data_nascimento: 'Data de nascimento', condominio_id: 'Condomínio', senha_atual: 'Senha atual', senha_nova: 'Senha nova',
};

function mensagemDeErro(status: number, corpo: unknown): string {
  const detail = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  // dados recusados: o servidor diz campo por campo o que faltou ou está errado
  if (Array.isArray(detail) && detail.length > 0) {
    const linhas = (detail as { loc?: unknown[]; msg?: string }[]).map(d => {
      const chave = String((d.loc ?? []).filter(p => p !== 'body').join('.'));
      const campo = NOME_DO_CAMPO[chave] ? tr(NOME_DO_CAMPO[chave]) : chave;
      const motivo = d.msg === 'Field required' ? tr('é obrigatório') : (d.msg ?? tr('não foi aceito'));
      return campo ? `${campo}: ${motivo}` : motivo;
    });
    return tr('O servidor não aceitou os dados. {0}.', [linhas.join('; ')]);
  }
  if (status === 429) return tr('Muitas tentativas. Espere 1 minuto e tente de novo.');
  if (status >= 500) return tr('Servidor indisponível. Tente novamente.');
  return tr('Erro {0}.', [status]);
}

// redirect_slashes=False no backend — nunca mandar barra no final do path (dá 404)
async function enviar(path: string, init: { method?: string; body?: unknown }): Promise<{ res: Response; corpo: unknown }> {
  // a identidade do aparelho vai em todo pedido, inclusive no login: a conta fica presa a ele
  await prepararAparelho();
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Idioma': idiomaAtual(), ...cabecalhosDoAparelho() };
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
    throw new ApiError(0, tr('Sem conexão com o servidor.'));
  }
  const corpo: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  return { res, corpo };
}

const UMA_HORA_MS = 60 * 60 * 1000;

/** O token em uso vence (ou já venceu) dentro deste prazo? Token ilegível conta como "não sei". */
function venceEm(prazoMs: number): boolean {
  if (!token) return false;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(base64)) as { exp?: number };
    return typeof exp === 'number' && exp * 1000 - Date.now() < prazoMs;
  } catch {
    return false;
  }
}

let renovando: Promise<boolean> | null = null;

/**
 * Troca o token por um novo, sem pedir senha (POST /auth/renovar). O token dura 8 horas e o
 * servidor aceita renovar por até 30 dias desde o login. Vários pedidos ao mesmo tempo
 * compartilham uma renovação só. Devolve se deu certo.
 */
export function renovarSessao(): Promise<boolean> {
  renovando ??= (async () => {
    try {
      const { res, corpo } = await enviar('/auth/renovar', { method: 'POST' });
      const nova = corpo as RespostaDeSessao | null;
      if (!res.ok || !nova?.access_token) return false;
      token = nova.access_token;
      aoRenovar?.(nova);
      return true;
    } catch {
      return false;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

// Por que a sessão foi encerrada sem a pessoa pedir (a conta foi aberta em outro aparelho, por
// exemplo). A tela de login mostra uma vez e apaga.
let motivoDaSaida: string | null = null;
export function consumirMotivoDaSaida(): string | null {
  const motivo = motivoDaSaida;
  motivoDaSaida = null;
  return motivo && tr(motivo);
}
const OUTRO_APARELHO = /outro aparelho/i;
const SAIU_POR_OUTRO_APARELHO = 'Esta conta foi aberta em outro aparelho, então saímos dela aqui. Para voltar a usar neste celular, peça à CM Port para liberar a troca de aparelho.';

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  // o login não tem sessão para renovar
  const comSessao = !!token && path !== '/auth/login';

  // falta menos de uma hora: renova antes, para o pedido não bater num token vencido
  if (comSessao && venceEm(UMA_HORA_MS)) await renovarSessao();

  let { res, corpo } = await enviar(path, init);

  // token recusado: tenta renovar uma vez e repete o pedido
  let sessaoPerdida = false;
  if (res.status === 401 && comSessao) {
    // o servidor diz quando a sessão caiu porque a conta foi aberta em outro aparelho
    const recusa = mensagemDeErro(res.status, corpo);
    if (await renovarSessao()) ({ res, corpo } = await enviar(path, init));
    else {
      sessaoPerdida = true;
      if (OUTRO_APARELHO.test(recusa)) motivoDaSaida = SAIU_POR_OUTRO_APARELHO;
    }
  }

  if (!res.ok) {
    // só encerra a sessão se a renovação foi recusada; um 401 com token novo é sobre o pedido
    // em si (a senha atual errada na troca de senha, por exemplo)
    const mensagem = mensagemDeErro(res.status, corpo);
    // A conta foi solta e aberta em outro celular: este aqui não pode continuar parecendo logado
    // (as telas ficariam abertas com dados antigos e todo toque daria erro). O servidor já recusa
    // tudo o que vem daqui; o app só acompanha, saindo da conta.
    if (res.status === 403 && comSessao && OUTRO_APARELHO.test(mensagem)) {
      motivoDaSaida = SAIU_POR_OUTRO_APARELHO;
      sessaoPerdida = true;
    }
    if (sessaoPerdida) aoExpirar?.();
    // senha provisória: nada abre até a pessoa criar a dela — pede a troca na hora
    if (res.status === 403 && comSessao && /senha provis[óo]ria/i.test(mensagem) && !/vencida/i.test(mensagem)) aoExigirTroca?.();
    throw new ApiError(res.status, trDoServidor(mensagem));
  }
  // nomes de condomínio chegam em MAIÚSCULAS; aqui viram texto normal (ver lib/texto.ts)
  return arrumarNomes(corpo) as T;
}
