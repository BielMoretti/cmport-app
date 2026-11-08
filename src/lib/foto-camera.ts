import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { tr } from '@/lib/idioma';

/**
 * Foto do ao vivo, com a marca d'água gravada dentro da imagem — versão do app.
 *
 * No Android o vídeo do RTCView é uma superfície à parte (SurfaceView): a cópia comum da tela
 * a deixa preta. Por isso a foto sai em dois passos (ver CameraPlayer):
 * 1. só a superfície do vídeo, copiada pelo PixelCopy (`handleGLSurfaceViewOnAndroid`);
 * 2. essa imagem posta numa caixa do mesmo tamanho com a MarcaDagua por cima, e a caixa copiada.
 * Se a marca fosse junto no passo 1, o vídeo seria pintado por cima dela.
 *
 * No iPhone o vídeo é desenhado pelo Metal e a cópia não foi testada: o botão não aparece lá.
 */
export const PODE_FOTOGRAFAR = Platform.OS === 'android';

/** Onde a foto foi parar. */
export type DestinoDaFoto = 'galeria' | 'compartilhado' | 'downloads';

/** O que a tela da câmera pede ao player. */
export interface ControlesDoPlayer {
  fotografar: () => Promise<DestinoDaFoto>;
}

/** Marca d'água que o navegador desenha na foto (no app quem desenha é a MarcaDagua). */
export interface MarcaDaFoto {
  texto: string;
  assinatura: string;
}

const dois = (n: number) => String(n).padStart(2, '0');

/** "CMPort_Portaria_2026-11-01_14-05-09.jpg" */
export function nomeDaFoto(nomeDaCamera: string | undefined, quando: Date): string {
  const camera = (nomeDaCamera ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const data = `${quando.getFullYear()}-${dois(quando.getMonth() + 1)}-${dois(quando.getDate())}_${dois(quando.getHours())}-${dois(quando.getMinutes())}-${dois(quando.getSeconds())}`;
  return `CMPort_${camera ? `${camera}_` : ''}${data}.jpg`;
}

/**
 * Copia uma caixa da tela para um JPEG e devolve o endereço do arquivo.
 * `comVideo`: a caixa tem a superfície do RTCView, que só sai pelo PixelCopy.
 */
export async function capturarCaixa(caixa: Parameters<typeof captureRef>[0], comVideo: boolean, nomeDoArquivo?: string): Promise<string> {
  return captureRef(caixa, {
    format: 'jpg',
    quality: 0.92,
    result: 'tmpfile',
    handleGLSurfaceViewOnAndroid: comVideo,
    ...(nomeDoArquivo ? { fileName: nomeDoArquivo.replace(/\.jpg$/, '') } : {}),
  });
}

/** Só no navegador: lá o quadro sai do próprio <video> (ver foto-camera.web.ts). */
export async function desenharFoto(_video: HTMLVideoElement, _marca: MarcaDaFoto): Promise<string> {
  throw new Error(tr('Não foi possível tirar a foto. Tente de novo.'));
}

/** Guarda na galeria; se a pessoa negar a permissão, abre o "compartilhar" para ela escolher onde salvar. */
export async function guardarFoto(foto: string, _nomeDoArquivo: string): Promise<DestinoDaFoto> {
  try {
    const permissao = await MediaLibrary.requestPermissionsAsync(true);
    if (permissao.granted) {
      await MediaLibrary.saveToLibraryAsync(foto);
      return 'galeria';
    }
  } catch {
    // sem galeria: cai no compartilhar, logo abaixo
  }
  await Sharing.shareAsync(foto, { mimeType: 'image/jpeg', dialogTitle: tr('Salvar foto') });
  return 'compartilhado';
}
