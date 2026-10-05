/**
 * Sistema de design do app, em três camadas. É a ÚNICA fonte de cores, medidas e
 * fontes — nenhuma tela deve escrever um valor cru (hex, raio, espaçamento).
 *
 *   1. primitivos   valores crus, sem significado            (muda quase nunca)
 *   2. semânticos   o que cada valor significa, por tema      (muda ao trocar de tema)
 *   3. componentes  medidas próprias de cada peça da interface (muda por componente)
 *
 * As telas usam só as camadas 2 e 3. Os primitivos não são exportados.
 */

// ───────────────────────────── 1. Primitivos ─────────────────────────────

// Cores tiradas do leão do logo: azul da coroa, marinho da juba, cinzas de aço.
const cor = {
  branco: '#FFFFFF',
  preto: '#000000',
  azul400: '#4D8FF7',
  azul500: '#1E6BFF',
  azul600: '#1F5FBF',
  marinho900: '#0E2240',
  marinho950: '#0C1422',
  aco50: '#F3F6FB',
  aco100: '#E3EAF5',
  marinho975: '#060C18',
  aco200: '#DCE3EE',
  aco400: '#93A4BD',
  aco600: '#5F7089',
  aco800: '#1C2A40',
  vermelho400: '#FF6B60',
  vermelho500: '#F0564E',
  aco500: '#8494AE',
  vermelho600: '#D92D20',
  vermelho700: '#C4271B',
} as const;

// Transparências e sombras do azul (o "efeito" do app) — derivadas de azul600 e azul400
const azulTranslucido = {
  claro: 'rgba(31, 95, 191, 0.10)',
  escuro: 'rgba(77, 143, 247, 0.18)',
} as const;

const sombraAzul = {
  claro: '0px 10px 28px rgba(31, 95, 191, 0.24)',
  escuro: '0px 10px 30px rgba(77, 143, 247, 0.38)',
} as const;

/** Espaçamento em base 4 (meio passo = 2px). Ex.: espaco[4] = 16. */
export const espaco = {
  0.5: 2, 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48,
} as const;

/** Raios de canto. */
export const raio = { pequeno: 8, medio: 16, grande: 24, pilula: 999 } as const;

/** Escala tipográfica (px). */
export const corpo = {
  micro: 11, pequeno: 13, legenda: 14, base: 15, nome: 17, nomeGrande: 18, cabecalho: 20, titulo: 22, destaque: 30,
} as const;

/** Altura de linha (px), casada com a escala de fonte. */
export const entrelinha = { micro: 13, base: 22, titulo: 26, destaque: 34 } as const;

/**
 * Plus Jakarta Sans em tudo: redonda e aberta, combina com os cantos arredondados e lê bem
 * em fundo preto. (A Barlow condensada deixava os nomes de condomínio apertados e pesados.)
 */
export const fontes = {
  nome: 'PlusJakartaSans_700Bold',
  texto: 'PlusJakartaSans_400Regular',
  textoForte: 'PlusJakartaSans_600SemiBold',
} as const;

// ───────────────────────────── 2. Semânticos ─────────────────────────────

export type Modo = 'claro' | 'escuro';

export interface Paleta {
  fundo: string;
  superficie: string;   // blocos e campos, um degrau acima do fundo
  texto: string;
  textoSuave: string;
  linha: string;
  azul: string;         // ações, seleção, o desenho do poste
  azulSuave: string;    // fundo tingido de azul (seleção, toque)
  sobreAzul: string;    // texto em cima do azul
  sobreLuz: string;     // texto em cima do azul puro (botão principal)
  brilho: string;       // sombra azul
  luz: string;          // azul puro dos brilhos e das janelas acesas nas ilustrações
  predio: string;       // silhueta dos prédios nas ilustrações
  erro: string;
  erroSuave: string;    // fundo tingido de vermelho (alerta grave)
  // Estado das câmeras nos gráficos. Conferidas com o validador de paleta (separação para
  // daltonismo e contraste); o cinza é neutro de propósito — significa "não sei".
  estadoOnline: string;
  estadoOffline: string;
  estadoNeutro: string;
}

export const paletas: Record<Modo, Paleta> = {
  claro: {
    fundo: cor.branco,
    superficie: cor.aco50,
    texto: cor.marinho900,
    textoSuave: cor.aco600,
    linha: cor.aco200,
    azul: cor.azul600,
    azulSuave: azulTranslucido.claro,
    sobreAzul: cor.branco,
    sobreLuz: cor.branco,
    brilho: sombraAzul.claro,
    luz: cor.azul600,
    predio: cor.aco100,
    erro: cor.vermelho700,
    erroSuave: 'rgba(196, 39, 27, 0.10)',
    estadoOnline: cor.azul600,
    estadoOffline: cor.vermelho700,
    estadoNeutro: cor.aco600,
  },
  escuro: {
    fundo: cor.preto,
    superficie: cor.marinho950,
    texto: cor.branco,
    textoSuave: cor.aco400,
    linha: cor.aco800,
    azul: cor.azul400,
    azulSuave: azulTranslucido.escuro,
    sobreAzul: cor.preto,
    sobreLuz: cor.branco,
    brilho: sombraAzul.escuro,
    luz: cor.azul500,
    predio: cor.marinho975,
    erro: cor.vermelho400,
    erroSuave: 'rgba(240, 86, 78, 0.16)',
    estadoOnline: cor.azul400,
    estadoOffline: cor.vermelho500,
    estadoNeutro: cor.aco500,
  },
};

/** Cores que não mudam com o tema: o palco do vídeo é sempre preto, o logo sempre em branco. */
export const palco = {
  fundo: cor.preto,
  texto: cor.branco,
  veu: 'rgba(0, 0, 0, 0.6)',       // fundo do selo sobre o vídeo
  aoVivo: cor.vermelho600,
  botaoFundo: cor.branco,
  botaoTexto: cor.marinho900,
  fundoDoLogo: cor.branco,
  // marca d'água: clara, com sombra escura leve pra aparecer em cena clara ou escura
  marca: 'rgba(255, 255, 255, 0.20)',
  marcaSombra: 'rgba(0, 0, 0, 0.30)',
} as const;

// ───────────────────────────── 3. Componentes ────────────────────────────

/** Medidas de cada peça. As cores vêm sempre da paleta do tema (camada 2). */
export const componentes = {
  /** Menor área tocável aceitável (acessibilidade). */
  alvoDeToque: 44,
  botao: { altura: 52, raio: raio.medio },
  botaoNoPalco: { altura: 44, raio: raio.medio, respiroH: espaco[5] },
  botaoIcone: { tamanho: 40, icone: 20 },
  campo: { raio: raio.medio, respiroH: espaco[3.5], respiroV: espaco[3] },
  cartao: { raio: raio.grande, alturaMin: 104, respiro: espaco[5], miniatura: 150 },
  heroi: { altura: 200, raio: raio.grande },
  faixa: { altura: 140 },
  leao: { largura: 150, altura: 194, brilho: 340 },
  estatistica: { numero: 34 },
  mira: { canto: 22, traco: 2, margem: espaco[3] },
  glifo: 20,
  linhaDoTempo: { altura: 44, marca: 3, rotulo: 44 },
  controle: { tamanho: 48, principal: 60 },
  marcaDagua: { fonteGrande: 13, fontePequena: 8, entrelinhas: 3.6, angulo: '-24deg' },
  parede: { larguraMinima: 260, larguraMaxima: 1180 },
  situacao: { altura: 76 },
  faixaDeEstado: { altura: 10 },
  medidor: { altura: 8 },
  caixaDeMarcar: 24,
  miniatura: { largura: 64, altura: 36 },
  alternador: { largura: 48, altura: 28, pino: 22 },
  // barra de abas flutuante, em pílula; `reserva` é o espaço que as telas deixam embaixo pra ela
  abas: { altura: 68, icone: 22, margem: espaco[4], reserva: 124, larguraMaxima: 480 },
  iconeCaixa: { tamanho: 48, raio: 16, glifo: 24 },
  avatar: 44,
  brilhoDeFundo: 360,
  cartaoDeCondominio: { largura: 248, altura: 132 },
  conteudo: { larguraMaxima: 560 },
  chip: { altura: 36, raio: raio.pilula, respiroH: espaco[3.5] },
  linha: { alturaMin: 56 },
  poste: { coluna: 44, trilho: 4, topo: 12, halo: 26 },
  celulaHora: { altura: 52, raio: raio.medio },
  selo: { raio: raio.pilula, ponto: 8 },
  barraCarregando: { altura: 3 },
  logo: { disco: 132, largura: 96, altura: 112 },
  tela: { margem: espaco[4], larguraMaxFormulario: 440 },
} as const;
