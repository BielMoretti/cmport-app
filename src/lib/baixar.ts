/**
 * Baixar um intervalo de gravação com a marca d'água gravada dentro do vídeo — os tipos
 * do pedido. Quem faz o trabalho é o componente Gravador (um arquivo por plataforma):
 * no navegador ele regrava o vídeo ali mesmo; no app Android, numa página invisível.
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
  /** quem baixou e quando — repetido, bem transparente, por todo o quadro */
  marca: string;
  /** nome da câmera, escrito ao lado do relógio da gravação */
  rotulo: string;
  /** fração concluída, de 0 a 1 */
  aoProgredir?: (fracao: number) => void;
}

export interface ResultadoDoDownload {
  /** minutos que não puderam ser buscados e ficaram de fora */
  partesPuladas: number;
  /** onde o arquivo foi parar */
  destino: 'downloads' | 'galeria' | 'compartilhado';
}

export interface ControlesDoGravador {
  gravar: (pedido: PedidoDeDownload) => Promise<ResultadoDoDownload>;
}
