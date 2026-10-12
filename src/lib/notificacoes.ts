import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { api, ApiError } from '@/lib/api';
import { apagarItem, lerItem, salvarItem } from '@/lib/armazenamento';
import { tr } from '@/lib/idioma';

/**
 * Aviso no celular quando uma câmera fica fora do ar (e quando ela volta). Quem avisa é o
 * servidor, pelo serviço de notificações do Expo; aqui o aparelho pede a permissão, descobre
 * o próprio endereço de notificação e o registra na conta de quem está logado.
 *
 * Só o síndico e o técnico recebem (o servidor decide; o app só oferece a chave a eles).
 * A escolha vale por aparelho. Só Android; na prévia do navegador nada disto existe.
 */
const CHAVE = 'cmport_avisos_de_camera';        // guarda o endereço registrado; vazio = desligado
const CANAL = 'cameras';                        // o mesmo nome que o servidor manda em cada aviso

export const temNotificacoes = true;

/** Chamar uma vez, ao abrir o app: com o app na tela, o aviso também aparece e toca. */
export function prepararNotificacoes(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function enderecoDesteAparelho(): Promise<string> {
  // no Android 13 em diante, o pedido de permissão só aparece depois de existir um canal
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: tr('Câmeras fora do ar'),
    importance: Notifications.AndroidImportance.HIGH,
  });
  let permissao = await Notifications.getPermissionsAsync();
  if (!permissao.granted) permissao = await Notifications.requestPermissionsAsync();
  if (!permissao.granted) throw new Error(tr('As notificações estão desligadas para o CM Port. Ligue nas configurações do aparelho e tente de novo.'));

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) throw new Error(tr('Não foi possível ligar os avisos neste aparelho.'));
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function avisosLigados(): Promise<boolean> {
  return !!(await lerItem(CHAVE).catch(() => null));
}

/** Liga os avisos neste aparelho. Lança um erro com a mensagem para mostrar, se não der. */
export async function ligarAvisos(): Promise<void> {
  let endereco: string;
  try {
    endereco = await enderecoDesteAparelho();
  } catch (e) {
    // sem internet ou sem os serviços do Google, o aparelho não consegue um endereço
    throw e instanceof Error && e.message ? e : new Error(tr('Não foi possível ligar os avisos neste aparelho.'));
  }
  try {
    await api('/auth/me/push', { method: 'PUT', body: { token: endereco, ativo: true } });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) throw new Error(tr('Os avisos de câmera chegam na próxima atualização do serviço.'));
    throw new Error(e instanceof ApiError ? e.message : tr('Não foi possível ligar os avisos. Tente de novo.'));
  }
  await salvarItem(CHAVE, endereco);
}

let desligando = false;

/** Desliga os avisos neste aparelho (também ao sair da conta). Nunca lança erro. */
export async function desligarAvisos(): Promise<void> {
  if (desligando) return;             // sair da conta com a sessão vencida chamaria isto de novo
  desligando = true;
  try {
    const endereco = await lerItem(CHAVE).catch(() => null);
    if (!endereco) return;
    await apagarItem(CHAVE).catch(() => {});
    await api('/auth/me/push', { method: 'PUT', body: { token: endereco, ativo: false } }).catch(() => {});
  } finally {
    desligando = false;
  }
}

/** Ao abrir o app já logado: confirma o registro (o endereço do aparelho pode mudar). Em silêncio. */
export async function confirmarAvisos(): Promise<void> {
  if (!(await avisosLigados())) return;
  try {
    const endereco = await enderecoDesteAparelho();
    await api('/auth/me/push', { method: 'PUT', body: { token: endereco, ativo: true } });
    await salvarItem(CHAVE, endereco);
  } catch {
    // fica para a próxima abertura
  }
}

/** A câmera de um aviso que a pessoa tocou, para o app abrir direto nela. */
export function useCameraDoAviso(): number | null {
  const resposta = Notifications.useLastNotificationResponse();
  const dados = resposta?.notification.request.content.data as { camera_id?: unknown } | undefined;
  return typeof dados?.camera_id === 'number' ? dados.camera_id : null;
}
