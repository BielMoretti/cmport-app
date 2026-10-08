import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { lerItem, salvarItem } from '@/lib/armazenamento';
import { paletas, temaDeVidro, temas, type Modo, type Paleta } from '@/lib/tema';

const CHAVE_TEMA = 'cmport_tema';

interface TemaContextValue {
  modo: Modo;
  cores: Paleta;
  /** troca entre Escuro e Claro; nos outros temas não faz nada (eles são escolhidos em Minha conta) */
  alternar: () => void;
  definir: (novo: Modo) => void;
}

const TemaContext = createContext<TemaContextValue | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  // O app nasce no tema preto (a identidade é preto e azul); o branco fica a um toque
  const padrao: Modo = 'escuro';
  const [escolhido, setEscolhido] = useState<Modo | null>(null);

  useEffect(() => {
    lerItem(CHAVE_TEMA)
      .then(salvo => { const achado = temas.find(t => t.valor === salvo); if (achado) setEscolhido(achado.valor); })
      .catch(() => {});
  }, []);

  const modo = escolhido ?? padrao;

  const definir = useCallback((novo: Modo) => {
    setEscolhido(novo);
    salvarItem(CHAVE_TEMA, novo).catch(() => {});
  }, []);

  const alternar = useCallback(() => {
    if (temaDeVidro(modo)) definir(modo === 'claro' ? 'escuro' : 'claro');
  }, [modo, definir]);

  const valor = useMemo(() => ({ modo, cores: paletas[modo], alternar, definir }), [modo, alternar, definir]);

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema(): TemaContextValue {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema precisa estar dentro de <TemaProvider>.');
  return ctx;
}

/** Estilos que dependem do tema: passe uma função definida fora do componente. */
export function useEstilos<T>(criar: (cores: Paleta) => T): T {
  const { cores } = useTema();
  return useMemo(() => criar(cores), [criar, cores]);
}
