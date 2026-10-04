// Espelho dos schemas Pydantic do cmport-system (backend/app/schemas).

export type Role = 'DEV' | 'ADMIN' | 'USUARIO';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: Role;
  nome: string;
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
}

export type TipoConexaoCamera = 'RTSP_NVR' | 'RTMP_ISOLADA';

export interface Camera {
  id: number;
  condominio_id: number;
  condominio_nome: string | null;
  poste_id: number | null;
  nome: string;
  tipo_conexao: TipoConexaoCamera;
  canal: number | null;
  ativo: boolean;
}
