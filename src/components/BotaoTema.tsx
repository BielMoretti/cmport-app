import { Pressable } from 'react-native';

import { GlifoLua, GlifoSol } from '@/components/arte';
import { useTema } from '@/contexts/TemaContext';
import { componentes, espaco } from '@/lib/tema';

/** Alterna entre o tema claro e o escuro. O ícone mostra o tema em uso: sol no claro, lua no escuro. */
export default function BotaoTema() {
  const { modo, cores, alternar } = useTema();
  const { tamanho: T, icone: D } = componentes.botaoIcone;
  const Glifo = modo === 'claro' ? GlifoSol : GlifoLua;

  return (
    <Pressable
      onPress={alternar}
      hitSlop={espaco[3]}
      accessibilityRole="button"
      accessibilityLabel={modo === 'claro' ? 'Tema claro em uso. Mudar para o tema escuro' : 'Tema escuro em uso. Mudar para o tema claro'}
      style={({ pressed }) => ({
        width: T, height: T, borderRadius: T / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? cores.azulSuave : 'transparent',
      })}
    >
      <Glifo cor={cores.texto} tamanho={D + espaco[0.5]} />
    </Pressable>
  );
}
