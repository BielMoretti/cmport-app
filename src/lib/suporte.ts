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
/** A política de privacidade do app, numa página aberta (exigência das lojas), no endereço do morador. */
export const POLITICA_DE_PRIVACIDADE = 'https://app.cmport.com.br/privacidade';

/** Os termos de uso do app, na mesma página aberta do painel. Mudou a versão, o app pede o aceite de novo. */
export const TERMOS_DE_USO = 'https://app.cmport.com.br/termos';

/** Quem oferece o app (Termos de uso, seção 1). */
export const EMPRESA = {
  razaoSocial: 'CMPORT SISTEMAS DE ELETRONICOS DE SEGURANCA LTDA',
  cnpj: '22.761.557/0001-88',
  email: 'comercial@cmport.com.br',
};

async function abrirEndereco(endereco: string): Promise<boolean> {
  try {
    await Linking.openURL(endereco);
    return true;
  } catch {
    return false;
  }
}

/** Abre a política de privacidade no navegador. Devolve false se o aparelho não conseguiu abrir. */
export const abrirPolitica = () => abrirEndereco(POLITICA_DE_PRIVACIDADE);

/** Abre os termos de uso no navegador. Devolve false se o aparelho não conseguiu abrir. */
export const abrirTermos = () => abrirEndereco(TERMOS_DE_USO);

export async function falarComACmPort(assunto?: string): Promise<boolean> {
  const texto = assunto ?? tr('Olá! Preciso de ajuda com o aplicativo CM Port.');
  try {
    await Linking.openURL(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`);
    return true;
  } catch {
    return false;
  }
}
