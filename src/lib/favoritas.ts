import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { idDoToken } from './acesso';
import { lerItem, salvarItem } from './armazenamento';

/**
 * Câmeras favoritas de quem está logado: aparecem primeiro na tela inicial.
 * Ficam guardadas neste aparelho, uma lista por login — não vão para o servidor.
 */
const chave = (usuarioId: string) => `cmport_favoritas_${usuarioId}`;

let dono: string | null = null;          // de quem é a lista que está na memória
let lista: number[] = [];
const ouvintes = new Set<(ids: number[]) => void>();
const avisar = () => ouvintes.forEach(fn => fn(lista));

async function carregar(usuarioId: string) {
  dono = usuarioId;
  lista = [];
  try {
    const salvo = await lerItem(chave(usuarioId));
    const lido: unknown = salvo ? JSON.parse(salvo) : [];
    if (dono === usuarioId && Array.isArray(lido)) lista = lido.filter((x): x is number => typeof x === 'number');
  } catch {
    // lista corrompida: começa vazia
  }
  avisar();
}

function alternar(cameraId: number) {
  if (!dono) return;
  lista = lista.includes(cameraId) ? lista.filter(id => id !== cameraId) : [...lista, cameraId];
  avisar();
  void salvarItem(chave(dono), JSON.stringify(lista)).catch(() => {});
}

/** As favoritas de quem está logado e a função de marcar e desmarcar. */
export function useFavoritas(): { favoritas: number[]; ehFavorita: (cameraId: number) => boolean; alternar: (cameraId: number) => void } {
  const { usuario } = useAuth();
  const usuarioId = usuario ? idDoToken(usuario.token) : null;
  const [ids, setIds] = useState<number[]>(usuarioId && usuarioId === dono ? lista : []);

  useEffect(() => {
    ouvintes.add(setIds);
    if (usuarioId && usuarioId !== dono) void carregar(usuarioId);
    else setIds(usuarioId ? lista : []);
    return () => { ouvintes.delete(setIds); };
  }, [usuarioId]);

  return { favoritas: ids, ehFavorita: id => ids.includes(id), alternar };
}
