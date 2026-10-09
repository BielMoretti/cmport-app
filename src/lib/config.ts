/**
 * Endereço da API que este aplicativo (moradores) usa. É o ÚNICO lugar do código que sabe o endereço.
 *
 * Para trocar de API não se mexe aqui:
 *   - na prévia do computador: arquivo .env.local com EXPO_PUBLIC_API_URL (modelo em .env.example);
 *   - no APK ou AAB: o valor de EXPO_PUBLIC_API_URL de cada tipo de build, em eas.json.
 * O endereço abaixo é só o padrão de quando nenhum dos dois foi definido.
 *
 * Desde 08/10/2026 este app usa o serviço de CLIENTE (/api/cliente/v1): login próprio de síndico e
 * morador, só leitura de câmeras. O login da equipe CMPort não funciona nele.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://dash.cmport.com.br/api/cliente/v1').replace(/\/+$/, '');

/**
 * O backend devolve os links de vídeo e de miniatura como caminho ("/api/v1/gravacoes/...").
 * O app nativo precisa do endereço inteiro; links já completos (nuvem) passam direto.
 */
export function urlAbsoluta(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  if (/^https?:\/\//.test(caminho)) return caminho;
  return new URL(API_URL).origin + (caminho.startsWith('/') ? caminho : `/${caminho}`);
}
