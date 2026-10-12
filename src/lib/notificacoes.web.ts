/**
 * Na prévia do navegador não há notificação de câmera fora do ar (o app de verdade é o Android).
 * Mesmas funções de lib/notificacoes.ts, sem efeito; `temNotificacoes` esconde a chave em Minha conta.
 */
export const temNotificacoes = false;

export function prepararNotificacoes(): void {}

export async function avisosLigados(): Promise<boolean> {
  return false;
}

export async function ligarAvisos(): Promise<void> {}

export async function desligarAvisos(): Promise<void> {}

export async function confirmarAvisos(): Promise<void> {}

export function useCameraDoAviso(): number | null {
  return null;
}
