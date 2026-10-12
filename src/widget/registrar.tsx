import { registerWidgetTaskHandler, requestWidgetUpdate, type WidgetInfo, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { CameraWidget } from '@/widget/CameraWidget';
import { buscarDadosDoWidget } from '@/widget/dados';

// o mesmo nome que está em app.json (plugin react-native-android-widget)
const NOME = 'Camera';

async function desenhar(info: WidgetInfo) {
  return <CameraWidget dados={await buscarDadosDoWidget()} largura={Math.round(info.width)} altura={Math.round(info.height)} />;
}

/** O Android chama isto sem o aplicativo aberto: ao pôr o widget, de meia em meia hora, ao redimensionar e ao tocar. */
async function tarefa(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== NOME || props.widgetAction === 'WIDGET_DELETED') return;
  // toque que não é o "Atualizar" (abrir o app) é resolvido pelo próprio Android
  if (props.widgetAction === 'WIDGET_CLICK' && props.clickAction !== 'ATUALIZAR') return;
  props.renderWidget(await desenhar(props.widgetInfo));
}

/** Registra o widget. Chamado uma vez, na entrada do aplicativo (index.ts). */
export function registrarWidget(): void {
  registerWidgetTaskHandler(tarefa);
}

/** Refaz o widget agora (o app chama ao ir para o fundo: favorita trocada, saída da conta, trava ligada). */
export function atualizarWidget(): void {
  void requestWidgetUpdate({ widgetName: NOME, renderWidget: desenhar }).catch(() => {});
}
