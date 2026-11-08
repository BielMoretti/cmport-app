import { palco } from '@/lib/tema';
import { tr } from '@/lib/idioma';

/**
 * Foto do ao vivo, com a marca d'água gravada dentro da imagem — versão do navegador.
 * O quadro sai do próprio <video> num canvas, do tamanho que a câmera manda; a marca é
 * desenhada por cima como na tela (espalhada em diagonal + a assinatura num canto) e o
 * resultado é baixado como JPEG.
 */
export const PODE_FOTOGRAFAR = true;

export type DestinoDaFoto = 'galeria' | 'compartilhado' | 'downloads';

export interface ControlesDoPlayer {
  fotografar: () => Promise<DestinoDaFoto>;
}

export interface MarcaDaFoto {
  texto: string;
  assinatura: string;
}

const dois = (n: number) => String(n).padStart(2, '0');
const fonte = (px: number) => `600 ${px}px "Plus Jakarta Sans", system-ui, sans-serif`;

export function nomeDaFoto(nomeDaCamera: string | undefined, quando: Date): string {
  const camera = (nomeDaCamera ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const data = `${quando.getFullYear()}-${dois(quando.getMonth() + 1)}-${dois(quando.getDate())}_${dois(quando.getHours())}-${dois(quando.getMinutes())}-${dois(quando.getSeconds())}`;
  return `CMPort_${camera ? `${camera}_` : ''}${data}.jpg`;
}

/** Só no app (ver foto-camera.ts): no navegador o quadro sai do <video>. */
export async function capturarCaixa(_caixa: unknown, _comVideo: boolean, _nomeDoArquivo?: string): Promise<string> {
  throw new Error(tr('Não foi possível tirar a foto. Tente de novo.'));
}

/** Desenha o quadro atual do vídeo com a marca e devolve o endereço (blob:) do JPEG. */
export async function desenharFoto(video: HTMLVideoElement, marca: MarcaDaFoto): Promise<string> {
  const largura = video.videoWidth;
  const altura = video.videoHeight;
  if (!largura || !altura) throw new Error(tr('O vídeo ainda não tem imagem. Espere carregar e tente de novo.'));
  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error(tr('Não foi possível tirar a foto. Tente de novo.'));
  ctx.drawImage(video, 0, 0, largura, altura);

  // a espalhada: o texto repetido em diagonal, translúcido, com sombra para ler em parede branca
  const corpo = Math.max(13, Math.round(altura * 0.03));
  ctx.save();
  ctx.translate(largura / 2, altura / 2);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.font = fonte(corpo);
  ctx.textBaseline = 'middle';
  const passoX = ctx.measureText(marca.texto).width + corpo * 3.5;
  const passoY = corpo * 5;
  const alcance = largura + altura;
  // contorno escuro + miolo claro: lê em parede branca e em cena escura (mesma receita do vídeo baixado)
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, corpo * 0.16);
  ctx.strokeStyle = palco.marcaEspalhadaSombra;
  ctx.fillStyle = palco.marcaEspalhada;
  for (let y = -alcance, linha = 0; y < alcance; y += passoY, linha++) {
    for (let x = -alcance - (linha % 2) * (passoX / 2); x < alcance; x += passoX) {
      ctx.strokeText(marca.texto, x, y);
      ctx.fillText(marca.texto, x, y);
    }
  }
  ctx.restore();

  // a assinatura, embaixo à direita: quem tirou e quando
  const corpoAssinatura = Math.max(12, Math.round(altura * 0.026));
  const margem = Math.round(altura * 0.022);
  ctx.save();
  ctx.font = fonte(corpoAssinatura);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = palco.marcaSombra;
  ctx.shadowBlur = corpoAssinatura * 0.3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = palco.marca;
  ctx.fillText(marca.assinatura, largura - margem, altura - margem);
  ctx.restore();

  const blob = await new Promise<Blob | null>(resolve => tela.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error(tr('Não foi possível tirar a foto. Tente de novo.'));
  return URL.createObjectURL(blob);
}

/** Baixa o arquivo pelo navegador (vai para a pasta de downloads). */
export async function guardarFoto(foto: string, nomeDoArquivo: string): Promise<DestinoDaFoto> {
  const link = document.createElement('a');
  link.href = foto;
  link.download = nomeDoArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // o navegador já copiou o arquivo; o endereço pode ser liberado logo depois
  setTimeout(() => URL.revokeObjectURL(foto), 10_000);
  return 'downloads';
}
