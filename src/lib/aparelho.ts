import { Platform } from 'react-native';
import * as Application from 'expo-application';

import { lerItem, salvarItem } from './armazenamento';

/**
 * A identidade deste aparelho, mandada em todo pedido à API. É o que permite ao servidor
 * prender um login a um aparelho só ("só o primeiro celular que entrar").
 *
 * No Android é o ANDROID_ID: fixo para este aparelho e esta instalação do app, e continua o
 * mesmo se o app for reinstalado. Não é o endereço MAC — o Android não o entrega a
 * aplicativos desde a versão 6. Onde não há ANDROID_ID (navegador), sorteia-se um
 * identificador na primeira vez e ele fica guardado; limpar os dados do navegador gera outro.
 */
const CHAVE = 'cmport_aparelho';

let pronto: Promise<void> | null = null;
let id: string | null = null;
let nome = '';

function sortear(): string {
  const bytes = new Uint8Array(16);
  const seguro = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (seguro?.getRandomValues) seguro.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// cabeçalho HTTP só leva caracteres simples
const simples = (texto: string) => texto.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 80);

async function descobrir(): Promise<void> {
  if (Platform.OS === 'android') {
    const marca = (Platform.constants as { Brand?: string; Model?: string });
    nome = simples([marca.Brand, marca.Model].filter(Boolean).join(' ')) || 'Android';
    try {
      const androidId = Application.getAndroidId();
      if (androidId) { id = `android-${androidId}`; return; }
    } catch {
      // sem ANDROID_ID: cai no identificador sorteado, logo abaixo
    }
  } else {
    nome = Platform.OS === 'web' ? 'Navegador' : simples(Platform.OS);
  }
  try {
    let salvo = await lerItem(CHAVE);
    if (!salvo) { salvo = sortear(); await salvarItem(CHAVE, salvo); }
    id = `${Platform.OS}-${salvo}`;
  } catch {
    id = null;   // sem como guardar: segue sem identificador (login preso a aparelho será recusado)
  }
}

/** Descobre a identidade do aparelho uma vez; as chamadas seguintes só esperam a primeira. */
export function prepararAparelho(): Promise<void> {
  pronto ??= descobrir();
  return pronto;
}

/** Os cabeçalhos que identificam o aparelho (vazio se ainda não deu para descobrir). */
export function cabecalhosDoAparelho(): Record<string, string> {
  return id ? { 'X-Aparelho-Id': id, 'X-Aparelho-Nome': nome } : {};
}
