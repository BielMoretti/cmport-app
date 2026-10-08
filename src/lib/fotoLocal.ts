import { File, Paths } from 'expo-file-system';

/**
 * A foto do perfil guardada no aparelho (enquanto o servidor não a guarda). Vai para um
 * arquivo: o cofre de sessão (SecureStore) só aceita valores pequenos, e a foto não cabe.
 */
const arquivo = (usuarioId: number) => new File(Paths.document, `foto-perfil-${usuarioId}.txt`);

export async function lerFotoLocal(usuarioId: number): Promise<string | null> {
  try {
    const f = arquivo(usuarioId);
    return f.exists ? await f.text() : null;
  } catch {
    return null;
  }
}

export async function salvarFotoLocal(usuarioId: number, base64: string): Promise<void> {
  const f = arquivo(usuarioId);
  if (!f.exists) f.create();
  f.write(base64);
}

export async function apagarFotoLocal(usuarioId: number): Promise<void> {
  const f = arquivo(usuarioId);
  if (f.exists) f.delete();
}
