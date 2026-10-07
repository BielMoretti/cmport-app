import {
  ALL_FORMATS, BlobSource, BufferTarget, canEncodeVideo, CanvasSource, Input, Mp4OutputFormat, Output, QUALITY_HIGH, VideoSampleSink,
} from 'mediabunny';

import type { PedidoDeDownload } from './baixar';

/**
 * Baixar um intervalo de gravação com a marca d'água gravada DENTRO do vídeo (versão do navegador).
 *
 * Os arquivos do servidor vêm limpos, um por minuto. Aqui cada um é decodificado, cada quadro
 * dentro do intervalo pedido recebe a marca e o relógio da gravação, e tudo é codificado de novo
 * num MP4 só — no próprio navegador (WebCodecs), sem subir nada. Só então o arquivo é entregue
 * para salvar: o que sai do app já sai marcado. O som não vai para o arquivo.
 */
export const PODE_BAIXAR = typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

const fonte = (px: number) => `600 ${px}px "Plus Jakarta Sans", system-ui, sans-serif`;
const dois = (n: number) => String(n).padStart(2, '0');

/** A marca, desenhada uma vez do tamanho do vídeo e depois carimbada em cada quadro. */
function desenharMarca(largura: number, altura: number, assinatura: string, fantasma: string): OffscreenCanvas {
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext('2d')!;

  // o fantasma: o mesmo texto em diagonal, quase invisível
  const corpoFantasma = Math.max(14, Math.round(altura * 0.028));
  ctx.save();
  ctx.translate(largura / 2, altura / 2);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.font = fonte(corpoFantasma);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  const passoX = ctx.measureText(fantasma).width + corpoFantasma * 10;
  const passoY = corpoFantasma * 7;
  const alcance = largura + altura;
  for (let y = -alcance, linha = 0; y < alcance; y += passoY, linha++) {
    for (let x = -alcance - (linha % 2) * (passoX / 2); x < alcance; x += passoX) ctx.fillText(fantasma, x, y);
  }
  ctx.restore();

  // a assinatura: uma linha pequena e legível no canto de baixo
  let corpo = Math.max(12, Math.round(altura * 0.024));
  ctx.font = fonte(corpo);
  const margem = Math.round(altura * 0.022);
  const cabe = largura - margem * 2;
  const medida = ctx.measureText(assinatura).width;
  if (medida > cabe) { corpo = Math.floor((corpo * cabe) / medida); ctx.font = fonte(corpo); }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = corpo * 0.3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.fillText(assinatura, largura - margem, altura - margem);
  return tela;
}

/** O relógio da gravação, no canto de cima: como os buracos sem gravação são pulados, é ele que diz a hora de cada quadro. */
function desenharRelogio(ctx: OffscreenCanvasRenderingContext2D, largura: number, altura: number, quando: Date) {
  const corpo = Math.max(12, Math.round(altura * 0.026));
  const margem = Math.round(altura * 0.022);
  ctx.save();
  ctx.font = fonte(corpo);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = corpo * 0.3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  const texto = `${dois(quando.getDate())}/${dois(quando.getMonth() + 1)}/${quando.getFullYear()} ${dois(quando.getHours())}:${dois(quando.getMinutes())}:${dois(quando.getSeconds())}`;
  ctx.fillText(texto, largura - margem, margem);
  ctx.restore();
}

function entregar(dados: ArrayBuffer, nome: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([dados], { type: 'video/mp4' }));
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

export async function baixarComMarca({ partes, de, ate, nomeDoArquivo, assinatura, fantasma, aoProgredir }: PedidoDeDownload): Promise<{ partesPuladas: number }> {
  const inicioPedido = de.getTime();
  const fimPedido = ate.getTime();

  let largura = 0;
  let altura = 0;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  let marca: OffscreenCanvas | null = null;
  let saida: Output | null = null;
  let codificador: CanvasSource | null = null;
  const alvo = new BufferTarget();

  let relogioDoArquivo = 0;   // segundos já escritos: onde o próximo trecho começa dentro do arquivo
  let quadros = 0;
  let puladas = 0;

  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];
    const duracaoDaParte = Math.max(1, (parte.fim.getTime() - parte.inicio.getTime()) / 1000);
    aoProgredir?.(i / partes.length);

    let input: Input | null = null;
    try {
      const resposta = await fetch(await parte.buscarUrl());
      if (!resposta.ok) throw new Error(String(resposta.status));
      input = new Input({ source: new BlobSource(await resposta.blob()), formats: ALL_FORMATS });
      const faixa = await input.getPrimaryVideoTrack();
      if (!faixa) throw new Error('sem vídeo');

      if (!saida) {
        largura = faixa.displayWidth;
        altura = faixa.displayHeight;
        if (!(await canEncodeVideo('avc', { width: largura, height: altura }))) {
          throw new Error('Este navegador não consegue gravar a marca neste vídeo. Tente pelo Chrome ou Edge atualizado.');
        }
        const quadro = new OffscreenCanvas(largura, altura);
        ctx = quadro.getContext('2d')!;
        marca = desenharMarca(largura, altura, assinatura, fantasma);
        codificador = new CanvasSource(quadro, { codec: 'avc', bitrate: QUALITY_HIGH });
        saida = new Output({ format: new Mp4OutputFormat(), target: alvo });
        saida.addVideoTrack(codificador);
        await saida.start();
      }

      const primeiro = await faixa.getFirstTimestamp();
      const comecoDaParte = parte.inicio.getTime();
      let base: number | null = null;       // posição, dentro do trecho, do primeiro quadro aproveitado
      let fimEscrito = relogioDoArquivo;

      for await (const amostra of new VideoSampleSink(faixa).samples()) {
        const dentroDoTrecho = amostra.timestamp - primeiro;
        const hora = comecoDaParte + dentroDoTrecho * 1000;
        // só entra o que está dentro do intervalo pedido (o primeiro e o último trecho são cortados)
        if (hora >= inicioPedido && hora < fimPedido) {
          base ??= dentroDoTrecho;
          amostra.draw(ctx!, 0, 0, largura, altura);
          ctx!.drawImage(marca!, 0, 0);
          desenharRelogio(ctx!, largura, altura, new Date(hora));
          const duracao = amostra.duration > 0 ? amostra.duration : 1 / 30;
          const quando = relogioDoArquivo + (dentroDoTrecho - base);
          await codificador!.add(quando, duracao);
          fimEscrito = quando + duracao;
          quadros++;
        }
        amostra.close();
        aoProgredir?.((i + Math.min(1, dentroDoTrecho / duracaoDaParte)) / partes.length);
      }
      relogioDoArquivo = fimEscrito;
    } catch (e) {
      // um trecho que falha não derruba o resto — a não ser que o navegador não saiba codificar
      if (e instanceof Error && e.message.startsWith('Este navegador')) throw e;
      puladas++;
    } finally {
      input?.dispose();
    }
  }

  if (!saida || quadros === 0) {
    throw new Error(puladas > 0
      ? 'Não foi possível buscar o vídeo desse intervalo no servidor. Tente de novo.'
      : 'Não há imagem gravada nesse intervalo.');
  }
  await saida.finalize();
  if (!alvo.buffer) throw new Error('O vídeo não pôde ser preparado. Tente de novo.');
  aoProgredir?.(1);
  entregar(alvo.buffer, nomeDoArquivo);
  return { partesPuladas: puladas };
}
