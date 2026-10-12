import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';

import type { DadosDoWidget } from '@/widget/dados';

// cores fixas: o widget fica na tela inicial do aparelho, fora dos temas do aplicativo
const FUNDO = '#0B1626';
const TEXTO = '#FFFFFF';
const APOIO = '#B7C3D6';
const VEU = '#000000A6';
const NO_AR = '#34D399';
const FORA = '#F87171';

/**
 * Widget da tela inicial: a última imagem de uma câmera (a primeira favorita), com o nome, a
 * hora em que foi buscada e a marca de quem está logado. Um toque abre a câmera no aplicativo;
 * "Atualizar" busca a imagem de novo. Não é vídeo: o Android não deixa widget tocar vídeo, e
 * só o atualiza sozinho de meia em meia hora.
 */
export function CameraWidget({ dados, largura, altura }: { dados: DadosDoWidget; largura: number; altura: number }) {
  if (dados.tipo === 'aviso') {
    return (
      <FlexWidget
        clickAction="OPEN_APP"
        style={{ width: 'match_parent', height: 'match_parent', backgroundColor: FUNDO, borderRadius: 20, padding: 16, justifyContent: 'center', alignItems: 'center' }}
      >
        <TextWidget text={dados.titulo} style={{ fontSize: 16, fontWeight: '700', color: TEXTO }} />
        <TextWidget text={dados.texto} maxLines={3} style={{ fontSize: 13, color: APOIO, marginTop: 6, textAlign: 'center' }} />
        <TextWidget text="Atualizar" clickAction="ATUALIZAR" style={{ fontSize: 13, fontWeight: '700', color: TEXTO, marginTop: 10 }} />
      </FlexWidget>
    );
  }

  const abrir = { clickAction: 'OPEN_URI', clickActionData: { uri: `cmport://camera/${dados.cameraId}` } } as const;
  return (
    <OverlapWidget style={{ width: 'match_parent', height: 'match_parent', backgroundColor: FUNDO, borderRadius: 20 }} {...abrir}>
      {dados.imagem ? (
        <ImageWidget image={dados.imagem as `https:${string}`} imageWidth={largura} imageHeight={altura} resizeMode="cover" radius={20} {...abrir} />
      ) : (
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'center', alignItems: 'center' }} {...abrir}>
          <TextWidget text="Sem imagem recente desta câmera" style={{ fontSize: 13, color: APOIO }} />
        </FlexWidget>
      )}

      {/* a marca de quem está vendo, como nas miniaturas do aplicativo */}
      <FlexWidget style={{ width: 'match_parent', height: 'match_parent', padding: 10, justifyContent: 'flex-start', alignItems: 'flex-start' }} {...abrir}>
        <TextWidget text={dados.marca} maxLines={1} truncate="END" style={{ fontSize: 10, color: '#FFFFFF9E' }} />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'flex-end' }}>
        <FlexWidget
          style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', backgroundColor: VEU, paddingHorizontal: 12, paddingVertical: 8, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}
        >
          <FlexWidget style={{ flex: 1 }} {...abrir}>
            <TextWidget text={dados.nome} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: '700', color: TEXTO }} />
            <TextWidget
              text={`${dados.online === false ? 'Fora do ar' : dados.online ? 'No ar' : 'Sem informação'} · ${dados.hora}`}
              maxLines={1}
              style={{ fontSize: 11, color: dados.online === false ? FORA : dados.online ? NO_AR : APOIO }}
            />
          </FlexWidget>
          <TextWidget text="Atualizar" clickAction="ATUALIZAR" style={{ fontSize: 12, fontWeight: '700', color: TEXTO, paddingLeft: 10, paddingVertical: 6 }} />
        </FlexWidget>
      </FlexWidget>
    </OverlapWidget>
  );
}
