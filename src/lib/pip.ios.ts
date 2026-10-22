/**
 * No iPhone não há a tela flutuante do Android (o expo-pip é só Android e nem tem o módulo
 * nativo aqui: importá-lo derrubaria o app na abertura). Mesmas funções de lib/pip.ts, sem
 * efeito; `temPip` falso esconde o botão.
 */
export const temPip = false;

export function voltandoDoPip(): boolean {
  return false;
}

export function useEmPip(): boolean {
  return false;
}

export function entrarEmPip(): void {}

export function pipAoSair(_ativo: boolean): void {}
