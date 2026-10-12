import * as LocalAuthentication from 'expo-local-authentication';

import { apagarItem, lerItem, salvarItem } from '@/lib/armazenamento';
import { tr } from '@/lib/idioma';

/**
 * Trava do aplicativo: pedir a digital ou o rosto (ou o bloqueio de tela do aparelho) ao abrir.
 *
 * É uma trava DESTE aparelho, para quem pega o celular desbloqueado não ver as câmeras. Não
 * troca a senha da conta nem vai ao servidor: a escolha fica guardada só aqui.
 */
const CHAVE = 'cmport_biometria';

/** O aparelho tem leitor de digital ou de rosto, e a pessoa já cadastrou um deles? */
export async function biometriaDisponivel(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function biometriaLigada(): Promise<boolean> {
  return (await lerItem(CHAVE).catch(() => null)) === '1';
}

export async function guardarBiometria(ligada: boolean): Promise<void> {
  if (ligada) await salvarItem(CHAVE, '1');
  else await apagarItem(CHAVE);
}

/**
 * Pede a digital ou o rosto. Se o leitor falhar, o próprio aparelho oferece o bloqueio de tela
 * (PIN, padrão ou senha) no lugar. Devolve se a pessoa passou.
 */
export async function pedirBiometria(motivo: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: motivo, cancelLabel: tr('Cancelar') });
    return r.success;
  } catch {
    return false;
  }
}
