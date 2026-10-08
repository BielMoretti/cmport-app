/**
 * O coração do "baixar gravação": junta os trechos de 1 minuto num MP4 só e grava a marca
 * d'água DENTRO de cada quadro. É JavaScript puro, sem nada do React, porque roda em dois
 * lugares com o mesmo código:
 *
 *   - no navegador (versão web), chamado direto por components/Gravador.web.tsx;
 *   - no app Android, dentro de uma página invisível (WebView), montada por
 *     scripts/gerar-pagina-do-gravador.js — o Android não tem como regravar vídeo fora dela.
 *
 * `M` é a biblioteca mediabunny (quem chama entrega). Usa WebCodecs: Chrome, Edge e o
 * WebView do Android.
 *
 * A marca cobre o quadro inteiro, bem transparente: o nome de quem baixou repetido em
 * diagonal. Cortar um canto do vídeo não a remove. No alto fica o relógio da gravação,
 * porque os buracos sem gravação são pulados e é ele que diz a hora de cada cena.
 */

const fonte = px => `600 ${px}px "Plus Jakarta Sans", system-ui, sans-serif`;
const dois = n => String(n).padStart(2, '0');

/** A marca, desenhada uma vez do tamanho do vídeo e depois carimbada em cada quadro. */
function desenharMarca(largura, altura, texto) {
  const tela = new OffscreenCanvas(largura, altura);
  const ctx = tela.getContext('2d');
  const corpo = Math.max(13, Math.round(altura * 0.032));
  ctx.translate(largura / 2, altura / 2);
  ctx.rotate((-24 * Math.PI) / 180);
  ctx.font = fonte(corpo);
  ctx.textBaseline = 'middle';
  const passoX = ctx.measureText(texto).width + corpo * 3.5;
  const passoY = corpo * 4.2;
  const alcance = largura + altura;
  // cada linha é escrita duas vezes: uma sombra escura e o texto claro por cima —
  // assim a marca aparece tanto numa parede branca quanto numa cena de noite
  for (let y = -alcance, linha = 0; y < alcance; y += passoY, linha++) {
    for (let x = -alcance - (linha % 2) * (passoX / 2); x < alcance; x += passoX) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
      ctx.fillText(texto, x + 1, y + 1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.fillText(texto, x, y);
    }
  }
  return tela;
}

/** O relógio da gravação (e o nome da câmera), no alto à direita. */
function desenharRelogio(ctx, largura, altura, rotulo, quando) {
  const corpo = Math.max(12, Math.round(altura * 0.026));
  const margem = Math.round(altura * 0.022);
  const hora = `${dois(quando.getDate())}/${dois(quando.getMonth() + 1)}/${quando.getFullYear()} ${dois(quando.getHours())}:${dois(quando.getMinutes())}:${dois(quando.getSeconds())}`;
  ctx.save();
  ctx.font = fonte(corpo);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = corpo * 0.3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.fillText(rotulo ? `${rotulo}  ${hora}` : hora, largura - margem, margem);
  ctx.restore();
}

/** Dá para gravar aqui? (navegador antigo ou sem codificador de vídeo: não) */
export function podeGravar() {
  return typeof VideoEncoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/**
 * @param M        a biblioteca mediabunny
 * @param pedido   { partes: [{ inicio, fim, obter }], de, ate, marca, rotulo, qualidade, aoProgredir }
 *                 inicio/fim/de/ate em milissegundos; obter() devolve o Blob do trecho
 * @returns        { dados: ArrayBuffer, partesPuladas: number }
 */
export async function gravarComMarca(M, pedido) {
  const { partes, de, ate, marca, rotulo, aoProgredir } = pedido;
  const qualidade = pedido.qualidade === 'media' ? M.QUALITY_MEDIUM : M.QUALITY_HIGH;

  let largura = 0;
  let altura = 0;
  let ctx = null;
  let carimbo = null;
  let saida = null;
  let codificador = null;
  const alvo = new M.BufferTarget();

  let relogioDoArquivo = 0;   // segundos já escritos: onde o próximo trecho começa dentro do arquivo
  let quadros = 0;
  let puladas = 0;

  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i];
    const duracaoDaParte = Math.max(1, (parte.fim - parte.inicio) / 1000);
    if (aoProgredir) aoProgredir(i / partes.length);

    let input = null;
    try {
      input = new M.Input({ source: new M.BlobSource(await parte.obter()), formats: M.ALL_FORMATS });
      const faixa = await input.getPrimaryVideoTrack();
      if (!faixa) throw new Error('sem vídeo');

      if (!saida) {
        largura = faixa.displayWidth;
        altura = faixa.displayHeight;
        if (!(await M.canEncodeVideo('avc', { width: largura, height: altura }))) {
          throw new Error('SEM_CODIFICADOR');
        }
        const quadro = new OffscreenCanvas(largura, altura);
        ctx = quadro.getContext('2d');
        carimbo = desenharMarca(largura, altura, marca);
        codificador = new M.CanvasSource(quadro, { codec: 'avc', bitrate: qualidade });
        saida = new M.Output({ format: new M.Mp4OutputFormat(), target: alvo });
        saida.addVideoTrack(codificador);
        await saida.start();
      }

      const primeiro = await faixa.getFirstTimestamp();
      let base = null;                 // posição, dentro do trecho, do primeiro quadro aproveitado
      let fimEscrito = relogioDoArquivo;

      for await (const amostra of new M.VideoSampleSink(faixa).samples()) {
        const dentroDoTrecho = amostra.timestamp - primeiro;
        const hora = parte.inicio + dentroDoTrecho * 1000;
        // só entra o que está dentro do intervalo pedido (o primeiro e o último trecho são cortados)
        if (hora >= de && hora < ate) {
          if (base === null) base = dentroDoTrecho;
          amostra.draw(ctx, 0, 0, largura, altura);
          ctx.drawImage(carimbo, 0, 0);
          desenharRelogio(ctx, largura, altura, rotulo, new Date(hora));
          const duracao = amostra.duration > 0 ? amostra.duration : 1 / 30;
          const quando = relogioDoArquivo + (dentroDoTrecho - base);
          await codificador.add(quando, duracao);
          fimEscrito = quando + duracao;
          quadros++;
        }
        amostra.close();
        if (aoProgredir) aoProgredir((i + Math.min(1, dentroDoTrecho / duracaoDaParte)) / partes.length);
      }
      relogioDoArquivo = fimEscrito;
    } catch (e) {
      // um trecho que falha não derruba o resto — a não ser que o aparelho não saiba codificar
      if (e && e.message === 'SEM_CODIFICADOR') {
        throw new Error('Este aparelho não consegue gravar a marca neste vídeo.');
      }
      puladas++;
    } finally {
      if (input) input.dispose();
    }
  }

  if (!saida || quadros === 0) {
    throw new Error(puladas > 0
      ? 'Não foi possível buscar o vídeo desse intervalo no servidor. Tente de novo.'
      : 'Não há imagem gravada nesse intervalo.');
  }
  await saida.finalize();
  if (!alvo.buffer) throw new Error('O vídeo não pôde ser preparado. Tente de novo.');
  if (aoProgredir) aoProgredir(1);
  return { dados: alvo.buffer, partesPuladas: puladas };
}
