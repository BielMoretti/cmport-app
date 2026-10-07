/**
 * Baixar um intervalo de gravação com a marca d'água gravada dentro do vídeo.
 *
 * Este arquivo é o do aplicativo (Android): aqui ainda não há download. Gravar a marca
 * dentro do vídeo exige recodificar o arquivo, e no aparelho isso só é confiável se o
 * servidor entregar o vídeo já marcado. No navegador vale o `baixar.web.ts`.
 */
export interface ParteDoDownload {
  inicio: Date;
  fim: Date;
  /** pede o link temporário na hora de usar — ele vence em poucos minutos */
  buscarUrl: () => Promise<string>;
}

export interface PedidoDeDownload {
  /** os trechos gravados que tocam o intervalo, em ordem */
  partes: ParteDoDownload[];
  /** o intervalo pedido: entra o que foi gravado de `de` (inclusive) até `ate` (exclusive) */
  de: Date;
  ate: Date;
  nomeDoArquivo: string;
  /** linha legível no canto: câmera, intervalo, quem baixou e quando */
  assinatura: string;
  /** texto espalhado quase invisível por todo o quadro */
  fantasma: string;
  /** fração concluída, de 0 a 1 */
  aoProgredir?: (fracao: number) => void;
}

export const PODE_BAIXAR: boolean = false;

export async function baixarComMarca(_pedido: PedidoDeDownload): Promise<{ partesPuladas: number }> {
  throw new Error('Baixar gravações está disponível na versão web do CM Port.');
}
