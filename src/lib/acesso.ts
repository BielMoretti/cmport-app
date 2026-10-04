import type { Condominio, Poste, Role } from './types';

// ───────────────────────── Quem é a pessoa ─────────────────────────

/**
 * Perfil dentro do app. O backend só conhece três papéis (DEV, ADMIN, USUARIO):
 *   ADMIN e DEV  → administrador (vê a aba de administração)
 *   USUARIO      → morador (só assiste)
 *
 * Se o cmport-system ganhar um papel próprio de morador/síndico, o mapeamento
 * muda AQUI — as telas só perguntam `ehAdministrador`.
 *
 * ATENÇÃO: isto só esconde a aba. Hoje o backend aceita criar/editar poste e
 * câmera de qualquer usuário logado (só "rotacionar chave" exige ADMIN/DEV).
 * A trava de verdade precisa existir no servidor.
 */
export type Perfil = 'administrador' | 'morador';

export function perfilDe(role: Role | undefined): Perfil {
  return role === 'ADMIN' || role === 'DEV' ? 'administrador' : 'morador';
}

export const ehAdministrador = (role: Role | undefined) => perfilDe(role) === 'administrador';

/** Cadastro de usuários fica nas rotas /dev do backend, que exigem o papel DEV. */
export const podeGerenciarUsuarios = (role: Role | undefined) => role === 'DEV';

export const NOME_DO_PAPEL: Record<Role, string> = {
  USUARIO: 'Morador',
  ADMIN: 'Administrador',
  DEV: 'Desenvolvedor',
};

// ───────────────────────── O que a pessoa vê ─────────────────────────

export interface CondominioDoPainel extends Condominio {
  totalPostes: number;
  totalCameras: number;
}

/**
 * Quais condomínios aparecem no painel de quem está logado.
 *
 * HOJE: todo condomínio que tem poste instalado. O backend ainda não tem vínculo
 * usuário ↔ condomínio, então todo usuário logado enxerga os mesmos.
 *
 * DEPOIS: quando o backend passar a devolver só os condomínios liberados para o
 * usuário (ou uma lista de ids permitidos), o filtro entra AQUI — as telas não mudam.
 *
 * Limite conhecido: condomínio que só tem câmera avulsa (sem poste) não aparece,
 * porque a API não tem um "condomínios com câmera" e os postes são a única pista.
 */
export function condominiosDoPainel(condominios: Condominio[], postes: Poste[]): CondominioDoPainel[] {
  const porCondominio = new Map<number, { postes: number; cameras: number }>();
  for (const p of postes) {
    const atual = porCondominio.get(p.condominio_id) ?? { postes: 0, cameras: 0 };
    porCondominio.set(p.condominio_id, { postes: atual.postes + 1, cameras: atual.cameras + p.total_cameras });
  }
  return condominios
    .filter(c => porCondominio.has(c.id))
    .map(c => ({
      ...c,
      totalPostes: porCondominio.get(c.id)!.postes,
      totalCameras: porCondominio.get(c.id)!.cameras,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
