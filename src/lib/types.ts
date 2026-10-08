// Espelho dos schemas Pydantic do cmport-system (backend/app/schemas), conferido com o
// backend em produção em 04/10/2026.

// MORADOR e SINDICO ainda não existem em produção: dependem da API nova (ver CONTRATO-API-APP-*.md).
// SINDICO: vê todas as câmeras do condomínio dele, cria os moradores e libera as câmeras de cada um.
export type Role = 'DEV' | 'ADMIN_MASTER' | 'ADMIN' | 'USUARIO' | 'TECNICO' | 'SINDICO' | 'MORADOR';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: Role;
  nome: string;
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  criado_em: string;
  /** login preso a um aparelho só. Ausente = o servidor ainda não tem essa trava. */
  so_um_aparelho?: boolean;
  /** o aparelho registrado no primeiro login ("samsung SM-A546E"); nulo = ainda não entrou */
  aparelho_nome?: string | null;
  aparelho_em?: string | null;
  /** o condomínio do síndico ou do morador. Ausente = o servidor ainda não manda. */
  condominio_id?: number | null;
  condominio_nome?: string | null;
}

export interface Condominio {
  id: number;
  nome: string;
  cnpj: string | null;
  razao_social: string | null;
  tipo: string;
  ativo: boolean;
}

export interface Poste {
  id: number;
  condominio_id: number;
  condominio_nome: string | null;
  nome: string;
  observacao: string | null;
  ativo: boolean;
  total_cameras: number;
  criado_em: string;
  atualizado_em: string;
}

export type TipoConexaoCamera = 'RTSP_NVR' | 'RTMP_ISOLADA';
export type DiasRetencao = 7 | 14 | 30;
export type SaudeStatus = 'SAUDAVEL' | 'ATENCAO' | 'PROBLEMA' | 'SEM_DADOS';

export interface Camera {
  id: number;
  condominio_id: number;
  condominio_nome: string | null;
  poste_id: number | null;
  poste_nome: string | null;
  nome: string;
  tipo_conexao: TipoConexaoCamera;
  canal: number | null;
  nvr_ip: string | null;
  nvr_porta: number | null;
  nvr_usuario: string | null;
  // só vêm preenchidos pra quem gerencia câmeras — a chave é a credencial de publicação
  rtmp_stream_key: string | null;
  rtmp_url: string | null;
  dias_retencao: number;
  corrigir_tempo: boolean;
  ativo: boolean;
  /** recebendo vídeo agora? null = o servidor não conseguiu consultar */
  online: boolean | null;
  saude: SaudeStatus | null;
  /** última imagem da câmera (~30 s), link assinado e relativo — usar urlAbsoluta() */
  miniatura_url: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface SaudeItem {
  chave: string;
  nome: string;
  atual: string;
  minimo: string;
  recomendado: string;
  situacao: 'ok' | 'atencao' | 'problema' | 'sem_dados';
  dica: string;
}

export interface SaudeDaCamera {
  camera_id: number;
  status: SaudeStatus;
  itens: SaudeItem[];
  atualizado_em: string | null;
}
