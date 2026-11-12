import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ehDemo } from '@/lib/acesso';
import { api, ApiError, renovarSessao, setAoExigirTroca, setAoExpirar, setAoRenovar, setModoDemo, setToken } from '@/lib/api';
import { apagarItem, lerItem, salvarItem } from '@/lib/armazenamento';
import { conferirDemo, guardarSessaoDaDemo, lerSessaoDaDemo, prazoRestante, type Demonstracao } from '@/lib/demo';
import { buscarFoto } from '@/lib/foto';
import { desligarAvisos } from '@/lib/notificacoes';
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
  /** versão dos termos de uso que falta aceitar: até aceitar, só a janela dos termos fica disponível */
  termosPendentes?: string | null;
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
  /** grava no servidor o aceite da versão pendente dos termos de uso e libera o app */
  aceitarTermos: () => Promise<void>;
  /** link de demonstração aberto (lib/demo.ts): o prospecto e o prazo; null = conta de verdade ou ninguém */
  demo: Demonstracao | null;
  /** o link da demonstração foi encerrado ou venceu: o app mostra o aviso no lugar das telas */
  demoEncerrada: boolean;
  /** entra com o token trocado pelo código do link (tela entrar) */
  entrarDemo: (sessao: { token: string; demo: Demonstracao }) => void;
}

// de quanto em quanto tempo a demonstração confere no servidor se o link ainda vale
const PULSO_DA_DEMO_MS = 30_000;

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
  const [demo, setDemo] = useState<Demonstracao | null>(null);
  const [demoEncerrada, setDemoEncerrada] = useState(false);
  const emDemo = useRef(false);

  const logout = useCallback(async () => {
    if (emDemo.current) {
      // a demonstração não tem conta nem aviso registrado: só esquece o token desta aba
      emDemo.current = false;
      setModoDemo(false);
      guardarSessaoDaDemo(null);
      setToken(null);
      setUsuario(null);
      setDemo(null);
      return;
    }
    // quem saiu não recebe mais aviso de câmera neste aparelho (precisa da sessão: vem antes de limpá-la)
    await desligarAvisos();
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
        // demonstração aberta nesta aba (recarregou a página): continua nela; o pulso confere se ainda vale
        const daDemo = lerSessaoDaDemo();
        if (daDemo) {
          emDemo.current = true;
          setModoDemo(true);
          setToken(daDemo.token);
          setDemo(daDemo.demo);
          setUsuario({ token: daDemo.token, nome: daDemo.demo.prospecto, role: 'DEMO' });
          return;
        }
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
  const demonstracao = ehDemo(usuario?.role);
  useEffect(() => {
    // a demonstração não tem perfil nem foto (o servidor recusa)
    if (!token || demonstracao) return;
    let cancelado = false;
    buscarPerfil()
      .then(async ({ perfil, noServidor }) => {
        if (cancelado) return;
        if (perfil.apelido) setUsuario(atual => (atual && atual.apelido !== perfil.apelido ? { ...atual, apelido: perfil.apelido } : atual));
        // termos de uso: quem decide é o servidor; não é guardado entre aberturas, é perguntado de novo
        setUsuario(atual => (atual && (atual.termosPendentes ?? null) !== perfil.termosPendentes ? { ...atual, termosPendentes: perfil.termosPendentes } : atual));
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
  }, [token, demonstracao]);

  // A demonstração acabou (o servidor respondeu 401 ou o prazo passou): sai e mostra o aviso.
  const encerrarDemo = useCallback(() => {
    if (!emDemo.current) return;
    setDemoEncerrada(true);
    void logout();
  }, [logout]);

  useEffect(() => {
    setAoExpirar(() => { if (emDemo.current) encerrarDemo(); else void logout(); });
    return () => setAoExpirar(null);
  }, [logout, encerrarDemo]);

  // Pulso da demonstração: confere no servidor se o link ainda vale e acerta o prazo pela hora dele.
  // Um 401 aqui (ou em qualquer pedido) encerra pelo setAoExpirar acima.
  useEffect(() => {
    if (!token || !demonstracao) return;
    let vivo = true;
    const conferir = () => {
      conferirDemo()
        .then(nova => {
          if (!vivo || !emDemo.current) return;
          if (prazoRestante(nova) <= 0) { encerrarDemo(); return; }
          setDemo(nova);
          guardarSessaoDaDemo({ token, demo: nova });
        })
        .catch(() => {});
    };
    conferir();
    const t = setInterval(conferir, PULSO_DA_DEMO_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [token, demonstracao, encerrarDemo]);

  // o prazo acaba entre um pulso e outro: sai na hora certa, sem esperar o próximo
  useEffect(() => {
    if (!demo) return;
    const falta = prazoRestante(demo);
    if (falta <= 0) { encerrarDemo(); return; }
    // o setTimeout não aceita mais de ~24 dias; o pulso marca de novo antes disso
    const t = setTimeout(encerrarDemo, Math.min(falta, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [demo, encerrarDemo]);

  const entrarDemo = useCallback((sessao: { token: string; demo: Demonstracao }) => {
    emDemo.current = true;
    setModoDemo(true);
    setToken(sessao.token);
    guardarSessaoDaDemo(sessao);
    setDemoEncerrada(false);
    setDemo(sessao.demo);
    setUsuario({ token: sessao.token, nome: sessao.demo.prospecto, role: 'DEMO' });
  }, []);

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

  const aceitarTermos = useCallback(async () => {
    const versao = usuario?.termosPendentes;
    if (!versao) return;
    try {
      await api('/auth/me/aceitar-termos', { method: 'POST', body: { versao } });
    } catch (e) {
      // 409 = saiu uma versão mais nova enquanto a janela estava aberta: pega a nova e pede de novo
      if (e instanceof ApiError && e.status === 409) {
        const { perfil } = await buscarPerfil();
        setUsuario(atual => (atual ? { ...atual, termosPendentes: perfil.termosPendentes } : atual));
      }
      throw e;
    }
    setUsuario(atual => (atual ? { ...atual, termosPendentes: null } : atual));
  }, [usuario?.termosPendentes]);

  const valor = useMemo(
    () => ({ usuario, carregando, login, logout, atualizarSessao, foto, definirFoto, senhaInicial, concluirPrimeiraSenha, aceitarTermos, demo, demoEncerrada, entrarDemo }),
    [usuario, carregando, login, logout, atualizarSessao, foto, senhaInicial, concluirPrimeiraSenha, aceitarTermos, demo, demoEncerrada, entrarDemo],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
