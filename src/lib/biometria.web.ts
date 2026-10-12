/**
 * Na prévia do navegador não há leitor de digital nem de rosto: a trava do aplicativo não existe
 * (o app de verdade é o Android). Mesmas funções de lib/biometria.ts, sempre "não".
 */
export async function biometriaDisponivel(): Promise<boolean> {
  return false;
}

export async function biometriaLigada(): Promise<boolean> {
  return false;
}

export async function guardarBiometria(_ligada: boolean): Promise<void> {}

export async function pedirBiometria(_motivo: string): Promise<boolean> {
  return false;
}
