/** Tipos do núcleo em JavaScript puro (ver nucleo.js). */
export interface ParteDoGravador {
  /** milissegundos */
  inicio: number;
  fim: number;
  obter: () => Promise<Blob>;
}

export interface PedidoDoGravador {
  partes: ParteDoGravador[];
  /** intervalo pedido, em milissegundos: entra de `de` (inclusive) até `ate` (exclusive) */
  de: number;
  ate: number;
  /** texto repetido por todo o quadro */
  marca: string;
  /** nome da câmera, ao lado do relógio */
  rotulo: string;
  qualidade?: 'alta' | 'media';
  aoProgredir?: (fracao: number) => void;
}

export function podeGravar(): boolean;
export function gravarComMarca(M: unknown, pedido: PedidoDoGravador): Promise<{ dados: ArrayBuffer; partesPuladas: number }>;
