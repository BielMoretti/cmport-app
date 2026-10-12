import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import ExpoPip from 'expo-pip';

/**
 * Tela flutuante (picture-in-picture): o ao vivo continua numa janelinha por cima dos outros
 * aplicativos. Só existe no Android; na prévia do navegador e no iPhone as funções não fazem
 * nada e `temPip` é falso (o botão não aparece).
 */
export const temPip = Platform.OS === 'android';

// a janelinha nasce na proporção do vídeo das câmeras
const JANELA = { width: 320, height: 180 };

// quando a janelinha foi desfeita pela última vez (a trava do app usa para não trancar quem só a ampliou)
let fimDoPip = 0;
let ouvindo = false;

function ouvir(): void {
  if (!temPip || ouvindo) return;
  ouvindo = true;
  try {
    ExpoPip.addEventListener('onPipModeChange', ({ isInPipMode }) => { if (!isInPipMode) fimDoPip = Date.now(); });
  } catch {
    // app instalado sem o módulo nativo (versão antiga): segue sem a tela flutuante
  }
}

/** Está agora na janelinha, ou acabou de sair dela (voltou a ocupar a tela)? */
export function voltandoDoPip(): boolean {
  if (!temPip) return false;
  ouvir();
  try {
    return ExpoPip.isInPipMode() === true || Date.now() - fimDoPip < 3000;
  } catch {
    return false;
  }
}

/** Se a tela está na janelinha: quem desenha o vídeo esconde o resto e deixa só a imagem. */
export function useEmPip(): boolean {
  const [emPip, setEmPip] = useState(false);
  useEffect(() => {
    if (!temPip) return;
    ouvir();
    try {
      const inscricao = ExpoPip.addEventListener('onPipModeChange', ({ isInPipMode }) => setEmPip(isInPipMode));
      return () => inscricao.remove();
    } catch {
      return;
    }
  }, []);
  return emPip;
}

/** Vai para a janelinha agora (o botão da tela da câmera). */
export function entrarEmPip(): void {
  if (!temPip) return;
  try {
    ExpoPip.enterPipMode(JANELA);
  } catch {
    // sem o módulo nativo, o botão não faz nada
  }
}

/**
 * Enquanto um ao vivo está na tela (`ativo`), sair para a tela inicial do aparelho já leva o
 * vídeo para a janelinha (Android 12 em diante). Com `ativo` falso, volta ao normal: nenhuma
 * outra tela do app vira janelinha.
 */
export function pipAoSair(ativo: boolean): void {
  if (!temPip) return;
  try {
    ExpoPip.setPictureInPictureParams({ ...JANELA, autoEnterEnabled: ativo, seamlessResizeEnabled: true });
  } catch {
    // idem
  }
}
