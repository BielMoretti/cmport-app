import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store não existe no navegador — na pré-visualização web a sessão
// fica no localStorage (só pra desenvolvimento; o app de verdade é o Android).
const web = Platform.OS === 'web';

export async function lerItem(chave: string): Promise<string | null> {
  if (web) return globalThis.localStorage?.getItem(chave) ?? null;
  return SecureStore.getItemAsync(chave);
}

export async function salvarItem(chave: string, valor: string): Promise<void> {
  if (web) {
    globalThis.localStorage?.setItem(chave, valor);
    return;
  }
  await SecureStore.setItemAsync(chave, valor);
}

export async function apagarItem(chave: string): Promise<void> {
  if (web) {
    globalThis.localStorage?.removeItem(chave);
    return;
  }
  await SecureStore.deleteItemAsync(chave);
}
