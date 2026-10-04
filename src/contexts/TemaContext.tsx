import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { lerItem, salvarItem } from '@/lib/armazenamento';
import { paletas, type Modo, type Paleta } from '@/lib/tema';

const CHAVE_TEMA = 'cmport_tema';

interface TemaContextValue {
  modo: Modo;
  cores: Paleta;
  alternar: () => void;
}

const TemaContext = createContext<TemaContextValue | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  // Começa pelo tema do aparelho; depois que a pessoa escolhe, a escolha fica salva
  const doAparelho: Modo = useColorScheme() === 'dark' ? 'escuro' : 'claro';
  const [escolhido, setEscolhido] = useState<Modo | null>(null);

  useEffect(() => {
    lerItem(CHAVE_TEMA)
      .then(salvo => { if (salvo === 'claro' || salvo === 'escuro') setEscolhido(salvo); })
      .catch(() => {});
  }, []);

  const modo = escolhido ?? doAparelho;

  const alternar = useCallback(() => {
    const novo: Modo = modo === 'claro' ? 'escuro' : 'claro';
    setEscolhido(novo);
    salvarItem(CHAVE_TEMA, novo).catch(() => {});
  }, [modo]);

  const valor = useMemo(() => ({ modo, cores: paletas[modo], alternar }), [modo, alternar]);

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
