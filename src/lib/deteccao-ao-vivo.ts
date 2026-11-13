import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api, ApiError } from '@/lib/api';

/**
 * Indicador (IA) no ao vivo — caixinha em pessoa, carro, moto, caminhão e bicicleta.
 *
 * Quem analisa a imagem é o SERVIDOR (o mesmo YOLOv8 do indicador do evento); o app só pergunta
 * onde estão as caixas e desenha por cima do vídeo (components/CaixasDeDeteccao.tsx).
 * Só roda nas câmeras com `deteccao_ia` ligado na dash: nas outras o app nem pergunta.
 *
 * Contrato da rota (a ser feita no cmport-system): GET /cameras/{id}/deteccoes-ao-vivo
 *  - 200 { largura, altura, deteccoes: [{ classe, score, caixa: [x1,y1,x2,y2] }] }
 *    `largura`/`altura` são as do quadro analisado; as caixas vêm em proporção 0-1 desse quadro.
 *    Câmera sem pessoa/carro agora, ou sem imagem: 200 com `deteccoes` vazia.
 *  - 404/403: indicador desligado (ou sem permissão) → o app para de perguntar nesta abertura.
 */
export interface Deteccao {
  classe: string;
  score: number;
  /** [x1,y1,x2,y2] em proporção 0-1 do quadro */
  caixa: [number, number, number, number];
}

export interface DeteccoesAoVivo {
  largura: number;
  altura: number;
  deteccoes: Deteccao[];
}

/** Descanso entre uma resposta e o próximo pedido (a análise no servidor leva de 1 a 3 s). */
export const PAUSA_ENTRE_PEDIDOS_MS = 1000;
/** Depois de um erro de rede, ou com o app em segundo plano: espera mais. */
export const PAUSA_APOS_ERRO_MS = 5000;
/** Caixa sem resposta nova há mais que isso some: melhor sem caixa que com caixa velha. */
export const VALIDADE_DA_CAIXA_MS = 4000;

/**
 * Pergunta ao servidor, em ciclo, onde estão as caixas desta câmera enquanto `ativo`.
 * Devolve null quando não há o que desenhar (desligado, sem resposta ou resposta velha).
 */
export function useDeteccoesAoVivo(cameraId: number, ativo: boolean): DeteccoesAoVivo | null {
  const [recebido, setRecebido] = useState<{ dados: DeteccoesAoVivo; em: number } | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const proximo = (ms: number) => { if (!cancelado) timer = setTimeout(pedir, ms); };

    async function pedir() {
      // com o app em segundo plano ninguém está olhando: não gasta o servidor nem a bateria
      if (AppState.currentState !== 'active') return proximo(PAUSA_APOS_ERRO_MS);
      try {
        const dados = await api<DeteccoesAoVivo>(`/cameras/${cameraId}/deteccoes-ao-vivo`);
        if (cancelado) return;
        setRecebido({ dados, em: Date.now() });
        proximo(PAUSA_ENTRE_PEDIDOS_MS);
      } catch (e) {
        if (cancelado) return;
        // desligado na dash (ou servidor ainda sem a rota): para de perguntar
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return;
        proximo(PAUSA_APOS_ERRO_MS);
      }
    }
    pedir();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      setRecebido(null);
    };
  }, [cameraId, ativo]);

  // relógio só para a caixa velha sumir; não roda com nada na tela
  const temCaixa = !!recebido;
  useEffect(() => {
    if (!temCaixa) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [temCaixa]);

  if (!ativo || !recebido || agora - recebido.em > VALIDADE_DA_CAIXA_MS) return null;
  return recebido.dados;
}
