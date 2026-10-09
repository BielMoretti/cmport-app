import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, renovarSessao, setAoExigirTroca, setAoExpirar, setAoRenovar, setToken } from '@/lib/api';
import { apagarItem, lerItem, salvarItem } from '@/lib/armazenamento';
import { buscarFoto } from '@/lib/foto';
import { buscarPerfil } from '@/lib/perfil';
import type { Role, TokenResponse } from '@/lib/types';

const CHAVE_SESSAO = 'cmport_sessao';

interface Sessao {
  token: string;
  nome: string;
  role: Role;
  /** como a pessoa quer ser chamada na saudação (Minha conta); vazio = primeiro nome */
  apelido?: string;
  /** primeiro acesso: só a tela de criar a própria senha fica disponível */
  trocarSenha?: boolean;
}

interface AuthContextValue {
  usuario: Sessao | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  /** depois de editar o perfil: troca o nome e o apelido de quem está logado, sem novo login */
  atualizarSessao: (dados: { nome: string; apelido: string }) => Promise<void>;
  /** a foto do perfil, pronta para um <Image>; null = sem foto (mostra as iniciais) */
  foto: string | null;
  definirFoto: (foto: string | null) => void;
  /** a senha digitada no login, enquanto a troca obrigatória não foi feita. Só na memória; null se o app foi reaberto */
  senhaInicial: () => string | null;
  /** a pessoa criou a própria senha: libera o app */
  concluirPrimeiraSenha: () => Promise<void>;
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
  // fica só na memória: é grande demais para o cofre da sessão e é buscada de novo ao abrir o app
  const [foto, definirFoto] = useState<string | null>(null);

  const logout = useCallback(async () => {
    senhaDoLogin.current = null;
    setToken(null);
    setUsuario(null);
    definirFoto(null);
    await apagarItem(CHAVE_SESSAO).catch(() => {});
  }, []);

  // Token renovado (dura 8 horas; o servidor renova por até 30 dias): guarda o novo no lugar do antigo.
  // Fica antes da restauração, para já estar registrado quando ela precisar renovar.
  const base = useRef<Sessao | null>(null);
  // nunca é gravada: serve só para a troca obrigatória não pedir de novo a senha que a pessoa acabou de digitar
  const senhaDoLogin = useRef<string | null>(null);
  useEffect(() => {
    setAoRenovar(nova => {
      setUsuario(atual => {
        const anterior = atual ?? base.current;
        const sessao: Sessao = {
          ...anterior, token: nova.access_token, nome: nova.nome, role: nova.role as Role,
          // a renovação também diz se a senha ainda é a provisória
          trocarSenha: typeof nova.precisa_trocar_senha === 'boolean' ? nova.precisa_trocar_senha : anterior?.trocarSenha,
        };
        void salvarItem(CHAVE_SESSAO, JSON.stringify(sessao)).catch(() => {});
        return sessao;
      });
    });
    // o servidor recusou um pedido por causa da senha provisória: abre a janela de troca
    setAoExigirTroca(() => {
      setUsuario(atual => {
        if (!atual || atual.trocarSenha) return atual;
        const sessao: Sessao = { ...atual, trocarSenha: true };
        void salvarItem(CHAVE_SESSAO, JSON.stringify(sessao)).catch(() => {});
        return sessao;
      });
    });
    return () => { setAoRenovar(null); setAoExigirTroca(null); };
  }, []);

  // Restaura a sessão salva ao abrir o app
  useEffect(() => {
    (async () => {
      try {
        const salvo = await lerItem(CHAVE_SESSAO);
        const sessao = salvo ? (JSON.parse(salvo) as Sessao) : null;
        if (sessao && tokenValido(sessao.token)) {
          // ainda vale: entra direto. Quando faltar menos de uma hora, o próximo pedido renova sozinho.
          setToken(sessao.token);
          setUsuario(sessao);
        } else if (sessao) {
          // venceu (dura 8 horas): tenta trocar por um novo sem pedir senha, antes de mandar ao login
          base.current = sessao;
          setToken(sessao.token);
          if (!(await renovarSessao())) {
            setToken(null);
            await apagarItem(CHAVE_SESSAO);
          }
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

  const atualizarSessao = useCallback(async (dados: { nome: string; apelido: string }) => {
    if (!usuario) return;
    const nova: Sessao = { ...usuario, nome: dados.nome, apelido: dados.apelido };
    setUsuario(nova);
    await salvarItem(CHAVE_SESSAO, JSON.stringify(nova)).catch(() => {});
  }, [usuario]);

  // o apelido e a foto não vêm no login: busca o perfil uma vez por sessão, em segundo plano
  const token = usuario?.token;
  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    buscarPerfil()
      .then(async ({ perfil, noServidor }) => {
        if (cancelado) return;
        if (perfil.apelido) setUsuario(atual => (atual && atual.apelido !== perfil.apelido ? { ...atual, apelido: perfil.apelido } : atual));
        // o servidor é quem sabe se a senha ainda é a provisória (vale também ao reabrir o app)
        setUsuario(atual => {
          // se o perfil não traz a informação, vale o que o login disse
          if (!atual || perfil.deveTrocarSenha === null || !!atual.trocarSenha === perfil.deveTrocarSenha) return atual;
          const nova = { ...atual, trocarSenha: perfil.deveTrocarSenha };
          void salvarItem(CHAVE_SESSAO, JSON.stringify(nova)).catch(() => {});
          return nova;
        });
        const imagem = await buscarFoto(perfil.id, noServidor);
        if (!cancelado) definirFoto(imagem);
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [token]);

  useEffect(() => {
    setAoExpirar(() => { void logout(); });
    return () => setAoExpirar(null);
  }, [logout]);

  const login = useCallback(async (email: string, senha: string) => {
    const res = await api<TokenResponse>('/auth/login', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), senha },
    });
    const sessao: Sessao = { token: res.access_token, nome: res.nome, role: res.role, trocarSenha: res.precisa_trocar_senha === true };
    senhaDoLogin.current = sessao.trocarSenha ? senha : null;
    setToken(sessao.token);
    setUsuario(sessao);
    await salvarItem(CHAVE_SESSAO, JSON.stringify(sessao));
  }, []);

  const senhaInicial = useCallback(() => senhaDoLogin.current, []);

  const concluirPrimeiraSenha = useCallback(async () => {
    senhaDoLogin.current = null;
    if (!usuario) return;
    const nova: Sessao = { ...usuario, trocarSenha: false };
    setUsuario(nova);
    await salvarItem(CHAVE_SESSAO, JSON.stringify(nova)).catch(() => {});
  }, [usuario]);

  const valor = useMemo(
    () => ({ usuario, carregando, login, logout, atualizarSessao, foto, definirFoto, senhaInicial, concluirPrimeiraSenha }),
    [usuario, carregando, login, logout, atualizarSessao, foto, senhaInicial, concluirPrimeiraSenha],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
