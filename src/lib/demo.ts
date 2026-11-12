import { Platform } from 'react-native';

import { api } from './api';
import { tr } from '@/lib/idioma';

/**
 * Link de demonstração: a equipe cria na dash um link `app.cmport.com.br/demo/entrar#<código>` e
 * o cliente abre no navegador (a versão web do app, servida em /demo). Entra sem senha, vê as
 * câmeras dos condomínios do link e só pode ver: o servidor recusa (403) tudo o que não é
 * câmera, poste, condomínio, ao vivo e gravação dos últimos 7 dias.
 *
 * O código vem depois do `#` para não passar pelo servidor (não cai em log). O app lê e apaga
 * da barra de endereço logo em seguida.
 *
 * - POST /demo/publico/entrar {codigo}  sem login → token da demonstração (404 se inválido/encerrado)
 * - POST /demo/aberto                   conta a abertura, só depois do toque no aviso (204; 401 = encerrado)
 * - GET  /demo/eu                       confere se ainda vale (401 = encerrado ou vencido)
 */
export interface Demonstracao {
  /** para quem é a demonstração: vai na saudação e na marca d'água */
  prospecto: string;
  /** quando o link vence (ms) */
  expiraEm: number;
  /** quanto o relógio do servidor está à frente deste aparelho (ms): o prazo é contado pelo servidor */
  defasagem: number;
  condominios: { id: number; nome: string }[];
}

interface RespostaDeEntrar {
  access_token: string;
  token_type: string;
  prospecto: string;
  expira_em: string;
  condominios: { id: number; nome: string }[];
}

interface RespostaDoEu {
  prospecto: string;
  expira_em: string;
  agora: string;
  condominios: { id: number; nome: string }[];
}

// O backend trabalha em UTC sem fuso ("2026-10-04T14:03:00"); sem o Z o aparelho leria como hora local
const lerUtc = (iso: string) => new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();

// o código lido do link fica guardado: a tela pode montar de novo depois que o # já saiu da barra
let codigoDoLink: string | null = null;
let fragmentoNaRota = false;

/** Acabou de ler um código do #: a tela deve se abrir de novo sem ele (o roteador o guarda). Uma vez só. */
export function limparFragmentoDaRota(): boolean {
  const limpar = fragmentoNaRota;
  fragmentoNaRota = false;
  return limpar;
}

/** O código que veio depois do `#` do link. Apaga o `#` da barra de endereço e do histórico. */
export function lerCodigoDoLink(): string | null {
  if (Platform.OS !== 'web') return codigoDoLink;
  const local = globalThis.location;
  const bruto = local?.hash?.replace(/^#/, '').trim() ?? '';
  if (bruto) {
    try {
      codigoDoLink = decodeURIComponent(bruto);
    } catch {
      codigoDoLink = bruto;
    }
    fragmentoNaRota = true;
    try {
      globalThis.history?.replaceState(globalThis.history.state, '', local.pathname + local.search);
    } catch {
      // sem como trocar o endereço: segue, o código só fica visível na barra
    }
  }
  return codigoDoLink;
}

// a mesma troca serve às duas montagens da tela (o código não é pedido duas vezes)
const trocas = new Map<string, Promise<{ token: string; demo: Demonstracao }>>();

/** Troca o código do link pelo token da demonstração. */
export function entrarNaDemo(codigo: string): Promise<{ token: string; demo: Demonstracao }> {
  let troca = trocas.get(codigo);
  if (!troca) {
    troca = api<RespostaDeEntrar>('/demo/publico/entrar', { method: 'POST', body: { codigo } }).then(r => ({
      token: r.access_token,
      demo: { prospecto: r.prospecto, expiraEm: lerUtc(r.expira_em), defasagem: 0, condominios: r.condominios },
    }));
    // deu errado: a próxima tentativa pergunta de novo
    troca.catch(() => trocas.delete(codigo));
    trocas.set(codigo, troca);
  }
  return troca;
}

/**
 * Avisa o servidor que o cliente entrou de fato (tocou em "Entendi, entrar"): só aqui a abertura
 * do link conta, uma vez. Recarregar a aba com a sessão guardada não chama de novo.
 */
export const avisarAbertura = () => api<void>('/demo/aberto', { method: 'POST' });

/** Confere no servidor se a demonstração ainda vale e traz o prazo pela hora dele. */
export async function conferirDemo(): Promise<Demonstracao> {
  const r = await api<RespostaDoEu>('/demo/eu');
  return { prospecto: r.prospecto, expiraEm: lerUtc(r.expira_em), defasagem: lerUtc(r.agora) - Date.now(), condominios: r.condominios };
}

/** Quanto falta para a demonstração vencer (ms), pelo relógio do servidor. */
export const prazoRestante = (demo: Demonstracao, agora = Date.now()) => demo.expiraEm - (agora + demo.defasagem);

// A sessão da demonstração fica só nesta aba do navegador (sessionStorage), com chave própria:
// nunca no lugar da sessão de uma conta de verdade, e some quando a aba fecha.
const CHAVE = 'cmport_demo';

export function lerSessaoDaDemo(): { token: string; demo: Demonstracao } | null {
  try {
    const salvo = globalThis.sessionStorage?.getItem(CHAVE);
    const lido = salvo ? (JSON.parse(salvo) as { token?: unknown; demo?: Demonstracao }) : null;
    return lido && typeof lido.token === 'string' && lido.demo ? { token: lido.token, demo: lido.demo } : null;
  } catch {
    return null;
  }
}

export function guardarSessaoDaDemo(sessao: { token: string; demo: Demonstracao } | null): void {
  try {
    if (sessao) globalThis.sessionStorage?.setItem(CHAVE, JSON.stringify(sessao));
    else globalThis.sessionStorage?.removeItem(CHAVE);
  } catch {
    // navegador sem armazenamento: a demonstração vale só enquanto a página não recarregar
  }
}

/** "2 dias", "5 h", "40 min". */
export function tempoRestante(ms: number): string {
  const minutos = Math.max(1, Math.ceil(ms / 60000));
  if (minutos < 60) return tr('{0} min', [minutos]);
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return tr('{0} h', [horas]);
  const dias = Math.floor(horas / 24);
  return dias === 1 ? tr('1 dia') : tr('{0} dias', [dias]);
}
