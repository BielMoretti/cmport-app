import { forwardRef, useImperativeHandle } from 'react';
import * as M from 'mediabunny';

import type { ControlesDoGravador } from '@/lib/baixar';
import { gravarComMarca, podeGravar } from '@/lib/gravador/nucleo';

/**
 * Versão do navegador: o vídeo é regravado com a marca aqui mesmo (WebCodecs), sem subir
 * nada, e entregue para a pasta de downloads. Não desenha nada na tela.
 */
export const PODE_BAIXAR = podeGravar();
/** O maior intervalo por download: o vídeo é montado na memória do navegador. */
export const MINUTOS_MAXIMOS = 30;

function entregar(dados: ArrayBuffer, nome: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([dados], { type: 'video/mp4' }));
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}

const Gravador = forwardRef<ControlesDoGravador>(function Gravador(_props, ref) {
  useImperativeHandle(ref, () => ({
    gravar: async pedido => {
      const { dados, partesPuladas } = await gravarComMarca(M, {
        de: pedido.de.getTime(),
        ate: pedido.ate.getTime(),
        marca: pedido.marca,
        rotulo: pedido.rotulo,
        qualidade: 'alta',
        aoProgredir: pedido.aoProgredir,
        partes: pedido.partes.map(p => ({
          inicio: p.inicio.getTime(),
          fim: p.fim.getTime(),
          obter: async () => {
            const resposta = await fetch(await p.buscarUrl());
            if (!resposta.ok) throw new Error(String(resposta.status));
            return resposta.blob();
          },
        })),
      });
      entregar(dados, pedido.nomeDoArquivo);
      return { partesPuladas, destino: 'downloads' as const };
    },
  }), []);
  return null;
});

export default Gravador;
