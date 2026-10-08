/**
 * Monta a página invisível que o app Android usa para regravar o vídeo com a marca d'água
 * (src/components/Gravador.tsx a carrega num WebView).
 *
 * Junta, num HTML só: a biblioteca mediabunny, o núcleo (src/lib/gravador/nucleo.js — o mesmo
 * código da versão web) e a ponte de mensagens com o app. O resultado vai para
 * src/lib/gravador/pagina.ts, que NÃO entra no git: é gerado de novo a cada `npm install`
 * (script "postinstall"), inclusive no servidor de build.
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const biblioteca = fs.readFileSync(path.join(raiz, 'node_modules/mediabunny/dist/bundles/mediabunny.min.cjs'), 'utf8');
const nucleo = fs.readFileSync(path.join(raiz, 'src/lib/gravador/nucleo.js'), 'utf8').replace(/^export /gm, '');

// A ponte: o app manda o pedido (window.__iniciar) e entrega os links (window.__url);
// a página devolve o progresso e o arquivo em pedaços (base64), porque o WebView só troca texto.
const ponte = `
(function () {
  var enviar = function (o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  var esperando = {};
  window.__url = function (i, url, erro) {
    var p = esperando[i]; delete esperando[i];
    if (!p) return;
    if (erro) p.no(new Error(erro)); else p.ok(url);
  };
  function pedirUrl(i) {
    return new Promise(function (ok, no) { esperando[i] = { ok: ok, no: no }; enviar({ tipo: 'url', i: i }); });
  }
  function emBase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  var pausa = function () { return new Promise(function (ok) { setTimeout(ok, 0); }); };

  window.__iniciar = async function (pedido) {
    try {
      if (!podeGravar()) throw new Error('Este aparelho não consegue gravar a marca no vídeo. Atualize o "WebView do sistema Android" na Play Store e tente de novo.');
      var ultimo = -1;
      var r = await gravarComMarca(M, {
        de: pedido.de, ate: pedido.ate, marca: pedido.marca, rotulo: pedido.rotulo, qualidade: pedido.qualidade,
        partes: pedido.partes.map(function (p, i) {
          return {
            inicio: p.inicio, fim: p.fim,
            obter: async function () {
              var url = await pedirUrl(i);
              var resposta = await fetch(url);
              if (!resposta.ok) throw new Error(String(resposta.status));
              return await resposta.blob();
            },
          };
        }),
        aoProgredir: function (f) {
          var p = Math.floor(f * 100);
          if (p !== ultimo) { ultimo = p; enviar({ tipo: 'progresso', f: f }); }
        },
      });
      var bytes = new Uint8Array(r.dados);
      var PEDACO = 384 * 1024;
      for (var i = 0; i < bytes.length; i += PEDACO) {
        enviar({ tipo: 'pedaco', dados: emBase64(bytes.subarray(i, i + PEDACO)) });
        await pausa();
      }
      enviar({ tipo: 'fim', puladas: r.partesPuladas, bytes: bytes.length });
    } catch (e) {
      enviar({ tipo: 'erro', mensagem: String((e && e.message) || e) });
    }
  };
  enviar({ tipo: 'pronto' });
})();
`;

// "</script" dentro de um <script> fecharia a tag antes da hora
const seguro = js => js.replace(/<\/script/gi, '<\\/script');

const html = [
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<script>var module = { exports: {} }; var exports = module.exports;</script>',
  `<script>${seguro(biblioteca)}</script>`,
  '<script>var M = module.exports;</script>',
  `<script>${seguro(nucleo)}\n${seguro(ponte)}</script>`,
  '</body></html>',
].join('\n');

const destino = path.join(raiz, 'src/lib/gravador/pagina.ts');
fs.writeFileSync(destino, [
  '// GERADO por scripts/gerar-pagina-do-gravador.js — não edite e não envie ao git.',
  '/** A página invisível que regrava o vídeo com a marca d\'água no app Android. */',
  `export const PAGINA_DO_GRAVADOR: string = ${JSON.stringify(html)};`,
  '',
].join('\n'));
console.log(`página do gravador: ${(html.length / 1024).toFixed(0)} KB em src/lib/gravador/pagina.ts`);
