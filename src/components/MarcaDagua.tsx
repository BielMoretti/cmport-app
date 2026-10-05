import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { textoDaMarca } from '@/lib/acesso';
import { componentes, fontes, palco } from '@/lib/tema';

/**
 * Marca d'água sobre as imagens de câmera: o nome de quem está logado, repetido
 * em diagonal por toda a imagem, claro o bastante para não atrapalhar e visível
 * o bastante para aparecer em qualquer foto ou gravação da tela.
 *
 * É uma camada do app, por cima do vídeo: identifica quem estava vendo quando a
 * tela foi capturada. Não está gravada dentro do arquivo de vídeo — isso só o
 * servidor conseguiria fazer.
 */
export default function MarcaDagua({ tamanho = 'grande' }: { tamanho?: 'grande' | 'pequena' }) {
  const { usuario } = useAuth();
  const [area, setArea] = useState({ largura: 0, altura: 0 });
  if (!usuario) return null;

  const texto = textoDaMarca(usuario);
  const fonte = tamanho === 'grande' ? componentes.marcaDagua.fonteGrande : componentes.marcaDagua.fontePequena;
  const passo = fonte * componentes.marcaDagua.entrelinhas;
  // o bloco girado precisa cobrir a diagonal: um quadrado de lado (largura + altura) sempre cobre
  const lado = area.largura + area.altura;
  const linhas = lado > 0 ? Math.ceil(lado / passo) + 1 : 0;
  const repeticoes = lado > 0 ? Math.ceil(lado / (texto.length * fonte * 0.5)) + 2 : 0;
  const linha = Array.from({ length: repeticoes }, () => texto).join('          ');

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={e => setArea({ largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height })}
      // decoração para quem enxerga a tela; leitor de tela ignora
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <View style={styles.recorte}>
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
              style={[styles.texto, { fontSize: fonte, lineHeight: passo, marginLeft: i % 2 === 0 ? 0 : -texto.length * fonte * 0.3 }]}
            >
              {linha}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  recorte: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  // texto claro com uma sombra escura leve: aparece tanto em cena escura quanto em parede branca
  texto: {
    fontFamily: fontes.textoForte, color: palco.marca, textShadowColor: palco.marcaSombra,
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
});
