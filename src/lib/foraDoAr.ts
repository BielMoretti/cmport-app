import { apagarItem, lerItem, salvarItem } from '@/lib/armazenamento';
import { tr } from '@/lib/idioma';
import { estadoDe } from '@/lib/saude';
import type { Camera } from '@/lib/types';

/**
 * Há quanto tempo cada câmera está fora do ar.
 *
 * O servidor diz se a câmera está no ar agora, mas não desde quando caiu. Então este aparelho
 * anota a hora em que VIU a câmera fora do ar pela primeira vez e apaga a anotação quando ela
 * volta. O tempo mostrado é "pelo menos isso": se o app ficou fechado, a queda pode ser mais antiga.
 */
const CHAVE = 'cmport_fora_do_ar';
/** Só vira aviso depois deste tempo: queda curta (reinício do roteador, oscilação) não incomoda ninguém. */
export const AVISAR_DEPOIS_DE_MS = 30 * 60 * 1000;

type Anotacoes = Record<string, number>;   // id da câmera → quando foi vista fora do ar (ms)

async function ler(): Promise<Anotacoes> {
  try {
    const bruto = await lerItem(CHAVE);
    const dado: unknown = bruto ? JSON.parse(bruto) : {};
    return dado && typeof dado === 'object' ? dado as Anotacoes : {};
  } catch {
    return {};
  }
}

export interface CameraForaDoAr {
  camera: Camera;
  /** desde quando este aparelho a vê fora do ar (ms) */
  desde: number;
}

/**
 * Atualiza as anotações com a lista que acabou de chegar do servidor e devolve as câmeras
 * fora do ar há tempo suficiente para avisar, a mais antiga primeiro.
 */
export async function conferirForaDoAr(cameras: Camera[], agora = Date.now()): Promise<CameraForaDoAr[]> {
  const antes = await ler();
  const depois: Anotacoes = {};
  const fora: CameraForaDoAr[] = [];
  for (const camera of cameras) {
    if (!camera.ativo || estadoDe(camera) !== 'offline') continue;   // voltou, ou o servidor não soube dizer: esquece
    const desde = antes[camera.id] ?? agora;
    depois[camera.id] = desde;
    if (agora - desde >= AVISAR_DEPOIS_DE_MS) fora.push({ camera, desde });
  }
  if (JSON.stringify(antes) !== JSON.stringify(depois)) {
    await (Object.keys(depois).length ? salvarItem(CHAVE, JSON.stringify(depois)) : apagarItem(CHAVE)).catch(() => {});
  }
  return fora.sort((a, b) => a.desde - b.desde);
}

/** "40 min", "3 h", "2 dias". */
export function tempoForaDoAr(desde: number, agora = Date.now()): string {
  const minutos = Math.max(1, Math.floor((agora - desde) / 60000));
  if (minutos < 60) return tr('{0} min', [minutos]);
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return tr('{0} h', [horas]);
  const dias = Math.floor(horas / 24);
  return dias === 1 ? tr('1 dia') : tr('{0} dias', [dias]);
}
