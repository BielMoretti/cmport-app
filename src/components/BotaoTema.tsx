import { Pressable, View } from 'react-native';

import { useTema } from '@/contexts/TemaContext';
import { componentes, espaco } from '@/lib/tema';

/** Alterna entre o tema branco e o preto. O ícone é um disco metade cheio (contraste). */
export default function BotaoTema() {
  const { modo, cores, alternar } = useTema();
  const { tamanho: T, icone: D } = componentes.botaoIcone;

  return (
    <Pressable
      onPress={alternar}
      hitSlop={espaco[3]}
      accessibilityRole="button"
      accessibilityLabel={modo === 'claro' ? 'Mudar para o tema preto' : 'Mudar para o tema branco'}
      style={({ pressed }) => ({
        width: T, height: T, borderRadius: T / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? cores.azulSuave : 'transparent',
      })}
    >
      <View style={{ width: D, height: D, borderRadius: D / 2, borderWidth: 2, borderColor: cores.texto, overflow: 'hidden' }}>
        <View style={{ width: D / 2 - 2, height: D, backgroundColor: cores.texto }} />
      </View>
    </Pressable>
  );
}
