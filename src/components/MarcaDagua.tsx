import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { assinaturaDaMarca, textoDaMarca } from '@/lib/acesso';
import { componentes, fontes, palco } from '@/lib/tema';

// por onde a assinatura passeia (o canto de cima à esquerda fica livre para o selo "Ao vivo")
const CANTOS: TextStyle[] = [
  { bottom: componentes.marcaDagua.margem, right: componentes.marcaDagua.margem },
  { top: componentes.marcaDagua.margem, right: componentes.marcaDagua.margem },
  { bottom: componentes.marcaDagua.margem, left: componentes.marcaDagua.margem },
];

/**
 * Marca d'água sobre as imagens de câmera, em duas camadas:
 *
 * - a assinatura: uma linha pequena num canto com quem está vendo e quando. No vídeo
 *   ela troca de canto de tempos em tempos, então cortar um canto não a remove;
 * - o fantasma: o mesmo texto espalhado em diagonal, quase invisível a olho nu, que
 *   aparece quando alguém aumenta o contraste de uma captura. Só nas imagens grandes.
 *
 * É uma camada do app por cima do vídeo. No arquivo baixado a marca é gravada dentro
 * da imagem (ver lib/baixar).
 */
export default function MarcaDagua({ tamanho = 'grande' }: { tamanho?: 'grande' | 'pequena' }) {
  const { usuario } = useAuth();
  const [area, setArea] = useState({ largura: 0, altura: 0 });
  const [volta, setVolta] = useState(0);
  const grande = tamanho === 'grande';

  useEffect(() => {
    if (!grande) return;
    const t = setInterval(() => setVolta(v => v + 1), componentes.marcaDagua.trocaMs);
    return () => clearInterval(t);
  }, [grande]);

  if (!usuario) return null;

  const texto = textoDaMarca(usuario);
  const fonte = componentes.marcaDagua.fantasma;
  const passo = fonte * componentes.marcaDagua.entrelinhas;
  // o bloco girado precisa cobrir a diagonal: um quadrado de lado (largura + altura) sempre cobre
  const lado = area.largura + area.altura;
  const linhas = grande && lado > 0 ? Math.ceil(lado / passo) + 1 : 0;
  const repeticoes = lado > 0 ? Math.ceil(lado / (texto.length * fonte)) + 2 : 0;
  const linha = Array.from({ length: repeticoes }, () => texto).join('                    ');

  return (
    <View
      style={styles.recorte}
      pointerEvents="none"
      onLayout={e => setArea({ largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height })}
      // decoração para quem enxerga a tela; leitor de tela ignora
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {linhas > 0 && (
        <View
          style={{
            position: 'absolute', width: lado, height: lado, left: -area.altura / 2, top: -area.largura / 2,
            transform: [{ rotate: componentes.marcaDagua.angulo }], justifyContent: 'center',
          }}
        >
          {Array.from({ length: linhas }, (_, i) => (
            <Text
              key={i}
              numberOfLines={1}
              style={[styles.fantasma, { fontSize: fonte, lineHeight: passo, marginLeft: i % 2 === 0 ? 0 : -texto.length * fonte * 0.6 }]}
            >
              {linha}
            </Text>
          ))}
        </View>
      )}

      <Text
        numberOfLines={1}
        style={[
          styles.assinatura,
          grande ? CANTOS[volta % CANTOS.length] : styles.cantoFixo,
          { fontSize: grande ? componentes.marcaDagua.fonteGrande : componentes.marcaDagua.fontePequena },
        ]}
      >
        {grande ? assinaturaDaMarca(usuario, new Date()) : texto}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  recorte: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  fantasma: { fontFamily: fontes.textoForte, color: palco.marcaFantasma },
  // clara com sombra escura: lê tanto em cena escura quanto em parede branca
  assinatura: {
    position: 'absolute', fontFamily: fontes.textoForte, color: palco.marca, textShadowColor: palco.marcaSombra,
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  cantoFixo: { top: componentes.marcaDagua.margem / 2, left: componentes.marcaDagua.margem / 2 },
});
