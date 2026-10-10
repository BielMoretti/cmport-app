import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { ControlesDoGravador, PedidoDeDownload, ResultadoDoDownload } from '@/lib/baixar';
import { API_URL } from '@/lib/config';
import { PAGINA_DO_GRAVADOR } from '@/lib/gravador/pagina';
import { tr } from '@/lib/idioma';

/**
 * Versão do app (Android): regravar o vídeo com a marca exige um codificador, e o que o
 * aparelho oferece sem biblioteca nativa pesada é o do navegador embutido. Então o trabalho
 * roda numa página invisível (WebView) com o MESMO código da versão web
 * (lib/gravador/nucleo.js). A página busca os trechos, grava a marca e devolve o MP4 em
 * pedaços; aqui eles viram um arquivo, que vai para a galeria do aparelho.
 *
 * A página é aberta "como se fosse" do endereço da API: assim ela pode buscar os vídeos
 * (mesma origem) e o navegador libera o codificador (exige endereço seguro, https).
 */
export const PODE_BAIXAR = true;
/** Menor que na web: o vídeo passa inteiro pela memória do aparelho. */
export const MINUTOS_MAXIMOS = 10;

type Mensagem =
  | { tipo: 'pronto' }
  | { tipo: 'url'; i: number }
  | { tipo: 'progresso'; f: number }
  | { tipo: 'pedaco'; dados: string }
  | { tipo: 'fim'; puladas: number; bytes: number }
  | { tipo: 'erro'; mensagem: string };

interface Trabalho {
  pedido: PedidoDeDownload;
  resolver: (r: ResultadoDoDownload) => void;
  rejeitar: (e: Error) => void;
  arquivo: File | null;
  caneta: ReturnType<File['open']> | null;
}

function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Guarda na galeria; se a pessoa negar a permissão, abre o "compartilhar" para ela escolher onde salvar. */
async function guardar(arquivo: File): Promise<'galeria' | 'compartilhado'> {
  try {
    const permissao = await MediaLibrary.requestPermissionsAsync(true);
    if (permissao.granted) {
      await MediaLibrary.saveToLibraryAsync(arquivo.uri);
      return 'galeria';
    }
  } catch {
    // sem galeria: cai no compartilhar, logo abaixo
  }
  await Sharing.shareAsync(arquivo.uri, { mimeType: 'video/mp4', dialogTitle: tr('Salvar gravação') });
  return 'compartilhado';
}

const Gravador = forwardRef<ControlesDoGravador>(function Gravador(_props, ref) {
  const pagina = useRef<WebView>(null);
  const trabalho = useRef<Trabalho | null>(null);
  // a página só existe enquanto há um download: cada um começa numa página nova
  const [rodada, setRodada] = useState<number | null>(null);

  const encerrar = useCallback((erro?: Error, resultado?: ResultadoDoDownload) => {
    const t = trabalho.current;
    trabalho.current = null;
    setRodada(null);
    if (!t) return;
    try { t.caneta?.close(); } catch { /* já fechada */ }
    if (erro) {
      try { if (t.arquivo?.exists) t.arquivo.delete(); } catch { /* fica no cache; o sistema limpa */ }
      t.rejeitar(erro);
    } else if (resultado) {
      t.resolver(resultado);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    gravar: pedido => new Promise<ResultadoDoDownload>((resolver, rejeitar) => {
      if (trabalho.current) { rejeitar(new Error(tr('Já há um download em andamento.'))); return; }
      trabalho.current = { pedido, resolver, rejeitar, arquivo: null, caneta: null };
      setRodada(Date.now());
    }),
  }), []);

  const aoReceber = useCallback((evento: WebViewMessageEvent) => {
    const t = trabalho.current;
    if (!t) return;
    let m: Mensagem;
    try { m = JSON.parse(evento.nativeEvent.data) as Mensagem; } catch { return; }

    if (m.tipo === 'pronto') {
      const pedido = {
        de: t.pedido.de.getTime(),
        ate: t.pedido.ate.getTime(),
        marca: t.pedido.marca,
        rotulo: t.pedido.rotulo,
        qualidade: 'media',
        partes: t.pedido.partes.map(p => ({ inicio: p.inicio.getTime(), fim: p.fim.getTime() })),
      };
      pagina.current?.injectJavaScript(`window.__iniciar(${JSON.stringify(pedido)}); true;`);
    } else if (m.tipo === 'url') {
      const i = m.i;
      // o link é pedido só agora, trecho a trecho: ele vence em poucos minutos
      t.pedido.partes[i].buscarUrl()
        .then(url => pagina.current?.injectJavaScript(`window.__url(${i}, ${JSON.stringify(url)}); true;`))
        .catch(() => pagina.current?.injectJavaScript(`window.__url(${i}, null, 'sem link'); true;`));
    } else if (m.tipo === 'progresso') {
      t.pedido.aoProgredir?.(m.f);
    } else if (m.tipo === 'pedaco') {
      try {
        if (!t.caneta) {
          t.arquivo = new File(Paths.cache, t.pedido.nomeDoArquivo);
          if (t.arquivo.exists) t.arquivo.delete();
          t.arquivo.create();
          t.caneta = t.arquivo.open();
        }
        t.caneta.writeBytes(deBase64(m.dados));
      } catch {
        encerrar(new Error(tr('Não foi possível gravar o vídeo no aparelho. Confira se há espaço livre.')));
      }
    } else if (m.tipo === 'fim') {
      const { arquivo, caneta } = t;
      try { caneta?.close(); } catch { /* segue */ }
      t.caneta = null;
      if (!arquivo) { encerrar(new Error(tr('O vídeo não pôde ser preparado. Tente de novo.'))); return; }
      const puladas = m.puladas;
      guardar(arquivo)
        .then(destino => encerrar(undefined, { partesPuladas: puladas, destino }))
        .catch(() => encerrar(new Error(tr('O vídeo foi preparado, mas não foi possível salvá-lo no aparelho.'))));
    } else if (m.tipo === 'erro') {
      encerrar(new Error(m.mensagem));
    }
  }, [encerrar]);

  if (rodada === null) return null;
  return (
    <WebView
      key={rodada}
      ref={pagina}
      source={{ html: PAGINA_DO_GRAVADOR, baseUrl: new URL(API_URL).origin }}
      originWhitelist={['*']}
      javaScriptEnabled
      onMessage={aoReceber}
      onError={() => encerrar(new Error(tr('Não foi possível abrir o gravador de vídeo do aparelho.')))}
      onRenderProcessGone={() => encerrar(new Error(tr('O aparelho ficou sem memória ao preparar o vídeo. Tente um intervalo menor.')))}
      style={styles.invisivel}
      pointerEvents="none"
    />
  );
});

export default Gravador;

const styles = StyleSheet.create({
  invisivel: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
