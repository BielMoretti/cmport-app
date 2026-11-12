// Configuração do app: tudo continua no app.json. Este arquivo só existe para a versão web da
// demonstração por link (src/lib/demo.ts), que fica em https://app.cmport.com.br/demo/.
//
// Sem a variável CMPORT_WEB_BASE_URL, devolve o app.json como está: os builds de Android e iPhone
// (EAS, GitHub Actions) e a prévia `npm run web` não mudam em nada. O baseUrl não pode ficar fixo
// no app.json porque a exportação nativa também o usa no caminho dos arquivos, e a própria CLI do
// Expo avisa que isso não é suportado fora da web.
//
// Gerar a web da demonstração (Expo SDK 57, experiments.baseUrl; vale só na exportação, não no
// `expo start`):
//
//   CMPORT_WEB_BASE_URL=/demo EXPO_PUBLIC_API_URL=https://app.cmport.com.br/api/cliente/v1 \
//     npx expo export --platform web --output-dir dist-demo
//
// No Git Bash do Windows, ponha MSYS_NO_PATHCONV=1 na frente: sem isso ele troca "/demo" por
// "C:/Program Files/Git/demo". O valor tem de começar com barra e não terminar com ela.
//
// A pasta dist-demo vai para /demo/ no servidor. O app é de uma página só (web.output "single"):
// qualquer endereço em /demo/ que não for arquivo tem de devolver o index.html, senão o link
// /demo/entrar dá 404 ao abrir. No nginx, por exemplo, com o conteúdo de dist-demo copiado para
// /var/www/app/demo (root, não alias: alias com try_files tem armadilhas no nginx):
//
//   location /demo/ {
//     root /var/www/app;
//     try_files $uri $uri/ /demo/index.html;
//   }
//
// O código do link vem depois do # (/demo/entrar#<código>): o navegador não manda o # ao
// servidor, então ele não aparece em log.
module.exports = ({ config }) => {
  const baseUrl = process.env.CMPORT_WEB_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
