import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DeteccoesAoVivo } from '@/lib/deteccao-ao-vivo';
import { tr } from '@/lib/idioma';
import { fontes, palco } from '@/lib/tema';

// mesmas classes do servidor (deteccao_service.py) e do indicador da dash
const NOME: Record<string, string> = {
  person: 'Pessoa',
  car: 'Carro',
  motorcycle: 'Moto',
  truck: 'Caminhão',
  bicycle: 'Bicicleta',
};

/**
 * Caixas do indicador (IA) por cima do vídeo ao vivo. Cobre o mesmo palco do vídeo e acompanha
 * o `contain` dele: a imagem fica centralizada, com faixas pretas nas sobras, e as caixas (em
 * proporção do quadro) são colocadas só em cima da imagem, não das faixas.
 */
export default function CaixasDeDeteccao({ dados }: { dados: DeteccoesAoVivo | null }) {
  const [palcoTam, setPalcoTam] = useState({ w: 0, h: 0 });

  let caixas: React.ReactNode = null;
  if (dados && dados.largura > 0 && dados.altura > 0 && palcoTam.w > 0 && palcoTam.h > 0) {
    const escala = Math.min(palcoTam.w / dados.largura, palcoTam.h / dados.altura);
    const w = dados.largura * escala, h = dados.altura * escala;
    const dx = (palcoTam.w - w) / 2, dy = (palcoTam.h - h) / 2;
    caixas = dados.deteccoes.map((d, i) => {
      const [x1, y1, x2, y2] = d.caixa;
      const nome = NOME[d.classe];
      return (
        <View
          key={i}
          style={[styles.caixa, { left: dx + x1 * w, top: dy + y1 * h, width: Math.max(2, (x2 - x1) * w), height: Math.max(2, (y2 - y1) * h) }]}
        >
          {nome && <Text style={styles.rotulo} numberOfLines={1}>{tr(nome)}</Text>}
        </View>
      );
    });
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      collapsable={false}
      onLayout={e => setPalcoTam({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {caixas}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { position: 'absolute', borderWidth: 2, borderColor: palco.indicador, borderRadius: 3 },
  // o rótulo fica logo acima da caixa; se a caixa está no topo da imagem, o excesso é cortado pelo palco
  rotulo: {
    position: 'absolute', left: -2, bottom: '100%', backgroundColor: palco.indicador, color: palco.indicadorTexto,
    fontFamily: fontes.textoForte, fontSize: 11, lineHeight: 14, paddingHorizontal: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
});
