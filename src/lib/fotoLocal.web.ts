/** Versão do navegador: a foto do perfil guardada no próprio navegador (localStorage). */
const chave = (usuarioId: number) => `cmport_foto_${usuarioId}`;

export async function lerFotoLocal(usuarioId: number): Promise<string | null> {
  return globalThis.localStorage?.getItem(chave(usuarioId)) ?? null;
}

export async function salvarFotoLocal(usuarioId: number, base64: string): Promise<void> {
  globalThis.localStorage?.setItem(chave(usuarioId), base64);
}

export async function apagarFotoLocal(usuarioId: number): Promise<void> {
  globalThis.localStorage?.removeItem(chave(usuarioId));
}
