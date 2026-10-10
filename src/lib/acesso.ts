import type { Camera, Condominio, Poste, Role } from './types';

// ───────────────────────── Quem é a pessoa ─────────────────────────

/**
 * Perfil dentro do app, a partir do nível do backend (core/dependencies.py):
 *   DEV, ADMIN_MASTER, ADMIN, TECNICO → gestor: cadastra e edita postes e câmeras
 *   USUARIO, MORADOR                  → só assiste
 *
 * O servidor aplica a mesma regra (`gestor_cameras`); o app só evita mostrar o que
 * a pessoa não pode usar.
 */
const GESTORES_DE_CAMERAS: Role[] = ['DEV', 'ADMIN_MASTER', 'ADMIN', 'TECNICO'];

export const ehAdministrador = (role: Role | undefined) => !!role && GESTORES_DE_CAMERAS.includes(role);

/** Gestão de usuários: DEV e ADMIN_MASTER (`require_gestor_usuarios`). */
/** Síndico: cuida dos moradores do próprio condomínio (cria, bloqueia, libera câmeras). */
export const ehSindico = (role: Role | undefined) => role === 'SINDICO';

/**
 * Diagnóstico do vídeo ("vídeo pede atenção", "o que ajustar") e a lista "Precisa de atenção":
 * é informação de quem instala e conserta, ou seja, do técnico. Morador e síndico não têm o
 * que fazer com ela e só ficam preocupados — para eles a câmera está no ar ou fora do ar.
 */
export const veDiagnostico = (role: Role | undefined) => role === 'TECNICO';

export const podeGerenciarUsuarios = (role: Role | undefined) => role === 'DEV' || role === 'ADMIN_MASTER';

/** Níveis que cada gestor pode dar a outra pessoa (usuario_service._pode_gerir). */
export function niveisQuePodeDar(role: Role | undefined): Role[] {
  if (role === 'DEV') return ['MORADOR', 'SINDICO', 'TECNICO', 'USUARIO', 'ADMIN', 'ADMIN_MASTER', 'DEV'];
  if (role === 'ADMIN_MASTER') return ['MORADOR', 'SINDICO', 'TECNICO', 'USUARIO', 'ADMIN'];
  if (role === 'SINDICO') return ['MORADOR'];
  return [];
}

export const NOME_DO_PAPEL: Record<Role, string> = {
  MORADOR: 'Morador',
  SINDICO: 'Síndico',
  TECNICO: 'Técnico',
  USUARIO: 'Usuário',
  ADMIN: 'Administrador',
  ADMIN_MASTER: 'Administrador master',
  DEV: 'Desenvolvedor',
};

// ───────────────────────── O que a pessoa vê ─────────────────────────

export interface CondominioDoPainel extends Condominio {
  totalPostes: number;
  totalCameras: number;
  /** imagem recente de uma câmera do condomínio, se alguma tiver */
  miniaturaUrl: string | null;
}

/**
 * Condomínios que aparecem no painel: os que têm poste ou câmera.
 *
 * O filtro por pessoa NÃO é feito aqui: quando o backend tiver o nível MORADOR
 * (proposta em cmport-backend-proposta), as listas de condomínios, postes e
 * câmeras já chegam filtradas pelo servidor, e esta função continua igual.
 */
export function condominiosDoPainel(condominios: Condominio[], postes: Poste[], cameras: Camera[]): CondominioDoPainel[] {
  const conta = new Map<number, { postes: number; cameras: number; miniatura: string | null }>();
  const de = (id: number) => conta.get(id) ?? { postes: 0, cameras: 0, miniatura: null };
  for (const p of postes) conta.set(p.condominio_id, { ...de(p.condominio_id), postes: de(p.condominio_id).postes + 1 });
  for (const c of cameras) {
    const atual = de(c.condominio_id);
    conta.set(c.condominio_id, { ...atual, cameras: atual.cameras + 1, miniatura: atual.miniatura ?? c.miniatura_url });
  }
  return condominios
    .filter(c => conta.has(c.id))
    .map(c => ({
      ...c,
      totalPostes: conta.get(c.id)!.postes,
      totalCameras: conta.get(c.id)!.cameras,
      miniaturaUrl: conta.get(c.id)!.miniatura,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// ───────────────────────── Marca d'água ─────────────────────────

/** Id do usuário, lido do token de sessão (campo `sub`). null se não der pra ler. */
export function idDoToken(token: string): string | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const sub = (JSON.parse(atob(base64)) as { sub?: unknown }).sub;
    return typeof sub === 'string' || typeof sub === 'number' ? String(sub) : null;
  } catch {
    return null;
  }
}

/**
 * Texto da marca d'água sobre as imagens de câmera: quem estava vendo.
 * Hoje é o nome + o id do login (que já existe no token). Quando o sistema ganhar
 * um identificador próprio por usuário, é só trocar aqui.
 */
export function textoDaMarca(usuario: { nome: string; token: string }): string {
  // o CPF não entra na marca (decisão do cliente em 08/10/2026), mesmo o serviço mandando-o mascarado
  const id = idDoToken(usuario.token);
  return id ? `${usuario.nome}  ID ${id}` : usuario.nome;
}

/** A linha que assina a imagem: a marca, quem estava vendo e quando. */
export function assinaturaDaMarca(usuario: { nome: string; token: string }, quando: Date): string {
  const data = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `CM PORT  ${textoDaMarca(usuario)}  ${data} ${hora}`;
}
