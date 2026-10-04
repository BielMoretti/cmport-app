import type { Condominio, Poste } from './types';

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
