/**
 * Nomes de condomínio chegam do sistema em MAIÚSCULAS e sem acento
 * ("CONDOMINIO EDIFICIO SOLAR DAS ACACIAS"). Na tela isso pesa e cansa; aqui eles
 * viram "Condomínio Edifício Solar das Acácias" — só para exibir, o dado não muda.
 */

import { tr } from '@/lib/idioma';

// preposições e artigos ficam em minúscula no meio do nome
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del', 'du']);
// algarismos romanos continuam em maiúscula (Bloco II, Fase IV)
const ROMANO = /^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
// palavras muito comuns em nome de condomínio que o cadastro grava sem acento
const ACENTOS: Record<string, string> = {
  condominio: 'Condomínio', edificio: 'Edifício', residencia: 'Residência', jardim: 'Jardim', acacias: 'Acácias',
  ipes: 'Ipês', nacoes: 'Nações', sao: 'São', joao: 'João', jose: 'José', antonio: 'Antônio', agua: 'Água',
  aguas: 'Águas', patio: 'Pátio', estacao: 'Estação', tatuape: 'Tatuapé', mooca: 'Mooca', analia: 'Anália',
  conceicao: 'Conceição', republica: 'República', america: 'América', italia: 'Itália', franca: 'França',
  paraiso: 'Paraíso', praca: 'Praça', vitoria: 'Vitória', gloria: 'Glória', flores: 'Flores', pinheiros: 'Pinheiros',
};

/** 10 → "R$ 10,00" (escrito à mão: o Intl do Android nem sempre traz o real). */
export function reais(valor: number): string {
  const [inteiro, centavos] = Math.abs(valor).toFixed(2).split('.');
  return `${valor < 0 ? '-' : ''}R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10" → "outubro" */
export function nomeDoMes(mes: string): string {
  const nome = MESES[Number(mes.split('-')[1]) - 1];
  return nome ? tr(nome) : mes;
}

export function nomeLegivel(nome: string): string {
  // só mexe em nome todo em maiúsculas — se alguém cadastrou com capricho, respeita
  if (!nome || nome !== nome.toUpperCase()) return nome;
  return nome
    .split(/(\s+|-)/)
    .map((parte, i) => {
      if (/^(\s+|-)$/.test(parte) || parte === '') return parte;
      const baixo = parte.toLowerCase();
      if (i > 0 && MINUSCULAS.has(baixo)) return baixo;
      if (parte.length > 1 && ROMANO.test(parte)) return parte;
      // sigla: sem nenhuma vogal (SP, CDHU não cai aqui, mas "BL", "QD" e afins sim)
      if (parte.length <= 4 && !/[AEIOU]/.test(parte)) return parte;
      return ACENTOS[baixo] ?? baixo.charAt(0).toUpperCase() + baixo.slice(1);
    })
    .join('');
}

/**
 * Passa por uma resposta da API e deixa legíveis os nomes de condomínio:
 * o campo `condominio_nome` (câmeras, postes) e o `nome` de quem tem `tipo`
 * CONDOMINIO/FORNECEDOR (a lista de condomínios). Nada mais é tocado.
 */
export function arrumarNomes<T>(dado: T): T {
  if (Array.isArray(dado)) {
    dado.forEach(arrumarNomes);
  } else if (dado && typeof dado === 'object') {
    const o = dado as Record<string, unknown>;
    if (typeof o.condominio_nome === 'string') o.condominio_nome = nomeLegivel(o.condominio_nome);
    if (typeof o.nome === 'string' && (o.tipo === 'CONDOMINIO' || o.tipo === 'FORNECEDOR')) o.nome = nomeLegivel(o.nome);
    // serviço de cliente: a lista de locais vem só com { id, nome }, e o perfil traz locais[] com papel
    else if (typeof o.nome === 'string' && ((Object.keys(o).length === 2 && 'id' in o) || ('condominio_id' in o && 'papel' in o))) o.nome = nomeLegivel(o.nome);
    for (const v of Object.values(o)) if (v && typeof v === 'object') arrumarNomes(v);
  }
  return dado;
}
