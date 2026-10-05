import { api } from './api';
import type { Camera, SaudeDaCamera, SaudeStatus } from './types';

/**
 * Conexão e qualidade do vídeo de uma câmera — contrato real do backend:
 * - `online` vem em toda câmera listada (o servidor pergunta ao MediaMTX);
 * - GET /cameras/{id}/saude detalha como o vídeo está chegando (worker recalcula a cada ~5 min).
 */
export type Estado = 'online' | 'offline' | 'desconhecido';

export function estadoDe(camera: Pick<Camera, 'online'>): Estado {
  if (camera.online === true) return 'online';
  if (camera.online === false) return 'offline';
  return 'desconhecido';
}

export const ROTULO_DO_ESTADO: Record<Estado, string> = {
  online: 'Online',
  offline: 'Offline',
  desconhecido: 'Sem informação',
};

export const ROTULO_DA_SAUDE: Record<SaudeStatus, string> = {
  SAUDAVEL: 'Vídeo saudável',
  ATENCAO: 'Vídeo pede atenção',
  PROBLEMA: 'Vídeo com problema',
  SEM_DADOS: 'Ainda sem medição',
};

export function buscarSaude(cameraId: number): Promise<SaudeDaCamera> {
  return api<SaudeDaCamera>(`/cameras/${cameraId}/saude`);
}
