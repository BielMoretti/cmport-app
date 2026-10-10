import { lerItem, salvarItem } from '@/lib/armazenamento';
import { EN, EN_PADROES } from '@/lib/traducoes';

/**
 * Idioma do aplicativo: português (o idioma em que o app foi escrito) ou inglês.
 *
 * Como funciona: o código continua com os textos em português, envolvidos por `tr(...)`. Em
 * português `tr` devolve o próprio texto; em inglês procura a tradução em lib/traducoes.ts — e,
 * se não achar, devolve o português, para nunca aparecer um buraco na tela.
 *
 * O idioma fica guardado no aparelho e vai ao servidor (cabeçalho X-Idioma e perfil), que usa a
 * escolha para mandar os e-mails de aviso no mesmo idioma.
 */
export type Idioma = 'pt' | 'en';

export const IDIOMAS: { valor: Idioma; nome: string }[] = [
  { valor: 'pt', nome: 'Português' },
  { valor: 'en', nome: 'English' },
];

const CHAVE = 'cmport_idioma';

/** Sem escolha guardada: o idioma do aparelho, se for inglês; senão português. */
function idiomaDoAparelho(): Idioma {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('en') ? 'en' : 'pt';
  } catch {
    return 'pt';
  }
}

let atual: Idioma = idiomaDoAparelho();
const ouvintes = new Set<() => void>();

export function idiomaAtual(): Idioma {
  return atual;
}

/** Para datas e horas: `data.toLocaleDateString(localeAtual(), ...)`. */
export function localeAtual(): string {
  return atual === 'en' ? 'en-US' : 'pt-BR';
}

/** Lê do aparelho o idioma escolhido antes. Chamado uma vez, ao abrir o app. */
export async function carregarIdioma(): Promise<Idioma> {
  try {
    const salvo = await lerItem(CHAVE);
    if (salvo === 'pt' || salvo === 'en') atual = salvo;
  } catch {
    // sem acesso ao armazenamento: segue com o idioma do aparelho
  }
  return atual;
}

export function definirIdioma(novo: Idioma): void {
  if (novo === atual) return;
  atual = novo;
  salvarItem(CHAVE, novo).catch(() => {});
  ouvintes.forEach(avisar => avisar());
}

/** Avisa quando o idioma muda (a raiz do app redesenha as telas). Devolve como parar de ouvir. */
export function aoMudarIdioma(avisar: () => void): () => void {
  ouvintes.add(avisar);
  return () => { ouvintes.delete(avisar); };
}

/**
 * O texto no idioma em uso. `valores` preenche os marcadores `{0}`, `{1}`...:
 * `tr('{0} foi criado e vê {1} {2}.', [nome, n, palavra])`.
 */
export function tr(texto: string, valores?: readonly unknown[]): string {
  let saida = atual === 'en' ? (EN[texto] ?? texto) : texto;
  if (valores) saida = saida.replace(/\{(\d+)\}/g, (_, i: string) => String(valores[Number(i)] ?? ''));
  return saida;
}

/**
 * Mensagem que veio do servidor (sempre em português): traduz as que o app conhece, inclusive as
 * que têm um número ou valor no meio. A que não conhecer aparece como veio.
 */
export function trDoServidor(mensagem: string): string {
  if (atual !== 'en') return mensagem;
  const exata = EN[mensagem];
  if (exata) return exata;
  for (const [padrao, ingles] of EN_PADROES) {
    const achou = padrao.exec(mensagem);
    if (achou) return ingles.replace(/\$(\d)/g, (_, i: string) => achou[Number(i)] ?? '');
  }
  return mensagem;
}
