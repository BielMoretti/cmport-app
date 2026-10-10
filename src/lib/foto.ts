import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { api, ApiError } from './api';
import { apagarFotoLocal, lerFotoLocal, salvarFotoLocal } from './fotoLocal';
import { tr } from '@/lib/idioma';

/**
 * A foto do perfil de quem está logado.
 *
 * A pessoa escolhe uma imagem da galeria; o app a reduz (320 px de largura, JPEG) antes de
 * guardar, então ela fica com poucas dezenas de KB e trafega dentro do próprio pedido.
 *
 * Contrato do servidor (proposta de backend):
 *   GET    /auth/me/foto  → { imagem_base64, tipo }   (404 = sem foto)
 *   PUT    /auth/me/foto  ← { imagem_base64, tipo }
 *   DELETE /auth/me/foto
 *
 * Enquanto a proposta não estiver publicada, a foto fica guardada só neste aparelho.
 */
const LARGURA = 320;
const semRota = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405);
const comoImagem = (base64: string, tipo = 'image/jpeg') => `data:${tipo};base64,${base64}`;

/** Abre a galeria e devolve a imagem já reduzida, em base64. null se a pessoa desistiu. */
export async function escolherFoto(): Promise<string | null> {
  const escolha = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
  if (escolha.canceled || !escolha.assets?.[0]) return null;
  const reduzida = await ImageManipulator.manipulate(escolha.assets[0].uri).resize({ width: LARGURA }).renderAsync();
  const { base64 } = await reduzida.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
  if (!base64) throw new Error(tr('Não foi possível preparar a imagem escolhida.'));
  return base64;
}

/** A foto atual, pronta para um <Image> ("data:image/jpeg;base64,..."), ou null. */
export async function buscarFoto(usuarioId: number, noServidor: boolean): Promise<string | null> {
  if (noServidor) {
    try {
      const r = await api<{ imagem_base64: string; tipo: string }>('/auth/me/foto');
      return comoImagem(r.imagem_base64, r.tipo);
    } catch (e) {
      if (!semRota(e)) throw e;
      // 404 no servidor novo = não tem foto; em servidor sem a rota, cai no aparelho
    }
  }
  const local = await lerFotoLocal(usuarioId);
  return local ? comoImagem(local) : null;
}

/** Guarda a foto. Devolve a imagem pronta para exibir e onde ela ficou. */
export async function salvarFoto(usuarioId: number, base64: string): Promise<{ imagem: string; onde: 'servidor' | 'aparelho' }> {
  try {
    await api('/auth/me/foto', { method: 'PUT', body: { imagem_base64: base64, tipo: 'image/jpeg' } });
    await apagarFotoLocal(usuarioId).catch(() => {});
    return { imagem: comoImagem(base64), onde: 'servidor' };
  } catch (e) {
    if (!semRota(e)) throw e;
  }
  await salvarFotoLocal(usuarioId, base64);
  return { imagem: comoImagem(base64), onde: 'aparelho' };
}

export async function apagarFoto(usuarioId: number): Promise<void> {
  try {
    await api('/auth/me/foto', { method: 'DELETE' });
  } catch (e) {
    if (!semRota(e)) throw e;
  }
  await apagarFotoLocal(usuarioId).catch(() => {});
}
