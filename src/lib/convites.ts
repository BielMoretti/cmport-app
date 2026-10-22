import { api } from './api';
import { tr } from './idioma';

/**
 * Convite de morador por link — contrato do serviço de cliente (acesso_cliente_convite_router.py):
 * - POST   /convites                        o síndico gera (o código só vem aqui, na criação)
 * - GET    /convites?condominio_id=          os convites dos locais dele
 * - DELETE /convites/{id}                    cancela um pendente
 * - GET    /convites/publico/{codigo}        sem login: o que mostrar a quem abriu o link
 * - POST   /convites/publico/{codigo}/aceitar sem login: cria a conta (ou vincula a que já existe)
 * Uso único, 7 dias. As câmeras são marcadas pelo síndico ao gerar; quem aceita não escolhe nada.
 */
export type SituacaoConvite = 'PENDENTE' | 'USADO' | 'CANCELADO' | 'VENCIDO';

export interface Convite {
  id: number;
  condominio_id: number;
  unidade: string;
  nome: string | null;
  criado_em: string;
  expira_em: string;
  situacao: SituacaoConvite;
  usado_em: string | null;
  usuario_nome: string | null;
  poste_ids: number[];
  camera_ids: number[];
}

export interface ConviteCriado extends Convite {
  link: string;
  codigo: string;
}

export interface ConvitePublico {
  condominio_nome: string | null;
  unidade: string;
  sindico_nome: string | null;
  expira_em: string;
  termos_vigentes: string;
}

export function gerarConvite(dados: {
  condominio_id: number; unidade: string; nome?: string; aceito_cobranca?: boolean; poste_ids: number[]; camera_ids: number[];
}): Promise<ConviteCriado> {
  return api<ConviteCriado>('/convites', { method: 'POST', body: dados });
}

export const listarConvites = () => api<Convite[]>('/convites');

export const cancelarConvite = (id: number) => api<void>(`/convites/${id}`, { method: 'DELETE' });

export const verConvite = (codigo: string) => api<ConvitePublico>(`/convites/publico/${encodeURIComponent(codigo)}`);

export function aceitarConvite(codigo: string, dados: {
  nome: string; email: string; cpf: string; telefone?: string; senha: string; aceito_termos: boolean; versao_termos?: string;
}): Promise<{ email: string; conta_nova: boolean; condominio_nome: string | null }> {
  return api(`/convites/publico/${encodeURIComponent(codigo)}/aceitar`, { method: 'POST', body: dados });
}

/** O texto que vai junto do link no WhatsApp. */
export function mensagemDoConvite(link: string, condominio: string | null, unidade: string): string {
  const texto = condominio
    ? tr('Você foi convidado para ver as câmeras do {0} pelo app CM Port (unidade {1}).', [condominio, unidade])
    : tr('Você foi convidado para ver as câmeras do seu condomínio pelo app CM Port (unidade {0}).', [unidade]);
  return `${texto} ${tr('Abra o link, instale o app e crie o seu acesso. Vale por 7 dias, uma vez só:')}\n${link}`;
}
