import { idDoToken, textoDaMarca } from '@/lib/acesso';
import { cabecalhosDoAparelho, prepararAparelho } from '@/lib/aparelho';
import { lerItem } from '@/lib/armazenamento';
import { API_URL, urlAbsoluta } from '@/lib/config';
import { estadoDe } from '@/lib/saude';
import type { Camera } from '@/lib/types';

/**
 * O que o widget da tela inicial do Android mostra. Roda sem o aplicativo aberto, então lê a
 * sessão direto do cofre do aparelho e pergunta ao servidor pela lista de câmeras.
 *
 * Cuidados:
 * - a imagem aparece mesmo com a trava por digital ligada (pedido do cliente em 12/10/2026): a
 *   trava protege o aplicativo, e tocar no widget abre o app, que aí pede a digital;
 * - a imagem leva a mesma marca de quem está logado que as miniaturas do app;
 * - o widget nunca renova a sessão: se ela venceu, pede para abrir o app.
 */
export type DadosDoWidget =
  | { tipo: 'camera'; cameraId: number; nome: string; local: string | null; imagem: string | null; online: boolean | null; marca: string; hora: string }
  | { tipo: 'aviso'; titulo: string; texto: string };

const aviso = (titulo: string, texto: string): DadosDoWidget => ({ tipo: 'aviso', titulo, texto });

interface SessaoGuardada { token?: string; nome?: string; trocarSenha?: boolean }

function vence(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function buscarDadosDoWidget(): Promise<DadosDoWidget> {
  let sessao: SessaoGuardada | null = null;
  try {
    const bruto = await lerItem('cmport_sessao');
    sessao = bruto ? JSON.parse(bruto) as SessaoGuardada : null;
  } catch {
    sessao = null;
  }
  if (!sessao?.token || !sessao.nome || sessao.trocarSenha) return aviso('CM Port', 'Entre no aplicativo para ver a câmera aqui.');
  if (vence(sessao.token) <= Date.now()) return aviso('CM Port', 'Abra o aplicativo para atualizar a imagem.');

  let cameras: Camera[];
  try {
    await prepararAparelho();
    const resposta = await fetch(`${API_URL}/cameras`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${sessao.token}`, ...cabecalhosDoAparelho() },
    });
    if (resposta.status === 401 || resposta.status === 403) return aviso('CM Port', 'Abra o aplicativo para atualizar a imagem.');
    if (!resposta.ok) return aviso('CM Port', 'Não foi possível buscar a câmera agora.');
    cameras = await resposta.json() as Camera[];
  } catch {
    return aviso('CM Port', 'Sem conexão com o servidor.');
  }
  const ativas = cameras.filter(c => c.ativo);
  if (!ativas.length) return aviso('CM Port', 'Nenhuma câmera liberada para você ainda.');

  // a primeira favorita de quem está logado; sem favorita, a primeira câmera no ar
  let favoritas: number[] = [];
  try {
    const id = idDoToken(sessao.token);
    const lido: unknown = id ? JSON.parse((await lerItem(`cmport_favoritas_${id}`)) ?? '[]') : [];
    if (Array.isArray(lido)) favoritas = lido.filter((x): x is number => typeof x === 'number');
  } catch {
    favoritas = [];
  }
  const camera = favoritas.map(id => ativas.find(c => c.id === id)).find((c): c is Camera => !!c)
    ?? ativas.find(c => estadoDe(c) === 'online') ?? ativas[0];

  const estado = estadoDe(camera);
  return {
    tipo: 'camera', cameraId: camera.id, nome: camera.nome, local: camera.condominio_nome,
    imagem: urlAbsoluta(camera.miniatura_url), online: estado === 'online' ? true : estado === 'offline' ? false : null,
    marca: textoDaMarca({ nome: sessao.nome, token: sessao.token }),
    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}
