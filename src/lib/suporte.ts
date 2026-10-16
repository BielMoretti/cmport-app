import { Linking } from 'react-native';

import { tr } from '@/lib/idioma';

/**
 * Falar com a CM Port: abre o WhatsApp do atendimento (o mesmo número que a equipe atende
 * pelo painel). O número pode ser trocado por build com EXPO_PUBLIC_WHATSAPP, só com dígitos,
 * com país e DDD.
 */
const WHATSAPP = (process.env.EXPO_PUBLIC_WHATSAPP ?? '5511940341682').replace(/\D/g, '');

/** Como o número aparece escrito na tela: +55 11 94034-1682. */
export const WHATSAPP_ESCRITO = WHATSAPP.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, '+$1 $2 $3-$4');

/**
 * Abre a conversa com a CM Port. O texto vai só sugerido no campo de mensagem (a pessoa manda
 * se quiser) e não leva nenhum dado dela. Devolve false se o aparelho não conseguiu abrir.
 */
/** A política de privacidade do app, numa página aberta do painel (exigência das lojas). */
export const POLITICA_DE_PRIVACIDADE = 'https://dash.cmport.com.br/privacidade';

/** Abre a política de privacidade no navegador. Devolve false se o aparelho não conseguiu abrir. */
export async function abrirPolitica(): Promise<boolean> {
  try {
    await Linking.openURL(POLITICA_DE_PRIVACIDADE);
    return true;
  } catch {
    return false;
  }
}

export async function falarComACmPort(assunto?: string): Promise<boolean> {
  const texto = assunto ?? tr('Olá! Preciso de ajuda com o aplicativo CM Port.');
  try {
    await Linking.openURL(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`);
    return true;
  } catch {
    return false;
  }
}
