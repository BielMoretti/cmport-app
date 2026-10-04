import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAoExpirar, setToken } from '@/lib/api';
import { apagarItem, lerItem, salvarItem } from '@/lib/armazenamento';
import type { Role, TokenResponse } from '@/lib/types';

const CHAVE_SESSAO = 'cmport_sessao';

interface Sessao {
  token: string;
  nome: string;
  role: Role;
}

interface AuthContextValue {
  usuario: Sessao | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function tokenValido(token: string): boolean {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  const logout = useCallback(async () => {
    setToken(null);
    setUsuario(null);
    await apagarItem(CHAVE_SESSAO).catch(() => {});
  }, []);

  // Restaura a sessão salva ao abrir o app
  useEffect(() => {
    (async () => {
      try {
        const salvo = await lerItem(CHAVE_SESSAO);
        const sessao = salvo ? (JSON.parse(salvo) as Sessao) : null;
        if (sessao && tokenValido(sessao.token)) {
          setToken(sessao.token);
          setUsuario(sessao);
        } else if (salvo) {
          await apagarItem(CHAVE_SESSAO);
        }
      } catch {
        /* sessão corrompida — segue deslogado */
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  useEffect(() => {
    setAoExpirar(() => { void logout(); });
    return () => setAoExpirar(null);
  }, [logout]);

  const login = useCallback(async (email: string, senha: string) => {
    const res = await api<TokenResponse>('/auth/login', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), senha },
    });
    const sessao: Sessao = { token: res.access_token, nome: res.nome, role: res.role };
    setToken(sessao.token);
    setUsuario(sessao);
    await salvarItem(CHAVE_SESSAO, JSON.stringify(sessao));
  }, []);

  const valor = useMemo(() => ({ usuario, carregando, login, logout }), [usuario, carregando, login, logout]);

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
