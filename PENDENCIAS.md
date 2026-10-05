# Pendências e melhorias

Atualizado em 04/10/2026. O que falta para o app ir a moradores e à Play Store, e o que vale
melhorar depois. A ordem dentro de cada bloco é a ordem sugerida.

## 1. Bloqueia a liberação para moradores

Sem estes itens, qualquer pessoa com login vê as câmeras de todos os condomínios.

- [ ] **Publicar a proposta de backend** (nível `MORADOR` e acesso por condomínio). Está pronta em
  `cmport-backend-proposta/` (fora deste repositório), com `PROPOSTA-MORADOR.md` e
  `proposta-morador.patch`. Depende do responsável pelo `cmport-system` revisar e publicar.
- [ ] **Testar a proposta com um MySQL de verdade** antes do deploy: a migração da coluna `role` e
  as rotas `/usuarios/{id}/condominios` só foram testadas com testes unitários.
- [ ] **Barrar o `MORADOR` no site** (`dash.cmport.com.br`): hoje ele conseguiria fazer login lá e
  levaria erro em quase tudo. É um ajuste no middleware do front web.
- [ ] **Criar os usuários moradores e marcar os condomínios de cada um** (aba Gestão → Usuários),
  depois que o backend for publicado.

## 2. Nunca foi testado

- [ ] **Rodar num celular Android.** O app só foi visto no navegador e em capturas de tela.
  Precisa de um build de desenvolvimento (`npm run build:dev`, exige conta Expo).
- [ ] **Vídeo ao vivo de verdade** no aparelho. A biblioteca `react-native-webrtc` consta como
  "não testada" na arquitetura nova do React Native.
- [ ] **Assistir uma gravação real** (link temporário + player).
- [ ] **Conferir as telas com dados de produção**: miniaturas, estado online, saúde, diagnóstico.
- [ ] **Marca d'água sobre vídeo tocando**, inclusive na tela cheia do player de gravação.

## 3. Hospedagem da versão web

- [ ] Registro DNS `app.cmport.com.br` apontando para a VPS.
- [ ] Certificado HTTPS para o novo endereço.
- [ ] Bloco no Nginx servindo o app e repassando `/api/v1/` ao backend (arquivos do `cmport-system`).
- [ ] Passo de deploy que gera a versão web (`npx expo export --platform web`) e envia para a VPS.
- [ ] No app: usar o endereço da API relativo quando rodar na web hospedada.

## 4. Play Store

- [ ] Conta de desenvolvedor no Google Play e conta na Expo.
- [ ] Ícone e tela de abertura próprios (hoje são os do modelo da Expo).
- [ ] Pacote da loja (`eas build --profile production`).
- [ ] Política de privacidade publicada (o app mostra imagens de câmeras; envolve a LGPD).
- [ ] Login de teste para a revisão do Google.
- [ ] Nome, descrição e capturas de tela da página da loja.

## 5. Melhorias

- [ ] **Marca d'água gravada no vídeo pelo servidor.** A atual é uma camada do app: foto de tela
  leva a marca, mas o arquivo de vídeo baixado pelo link não leva.
- [ ] **ID único por usuário na marca d'água.** Hoje usa o nome e o número do login; a troca é em
  `textoDaMarca()`, em `src/lib/acesso.ts`.
- [ ] **Nomes de condomínio:** siglas com vogal podem sair erradas na conversão de maiúsculas
  (ex.: "CDHU"). A lista de exceções fica em `src/lib/texto.ts`.
- [ ] **Avisos no celular** quando uma câmera cair (notificação push). Precisa de apoio do backend.
- [ ] **Vídeo ao vivo de câmera em gravador (NVR).** O backend só transmite câmeras `RTMP_ISOLADA`.
- [ ] **Tela cheia e rotação** no vídeo ao vivo.
- [ ] **Atualização sem loja** das telas (EAS Update), para corrigir sem esperar revisão do Google.
- [ ] **Testes automáticos** do app. Hoje a conferência é manual, por capturas de tela.
- [ ] **Manter compatibilidade da API** com versões antigas do app depois de publicado na loja.

## Feito recentemente

- App ligado ao contrato real do backend: gravações, estado online, saúde e miniaturas.
- Gestão: postes, câmeras (retenção, correção de horário, mover de poste e de condomínio, criação
  em lote), diagnóstico e usuários (nome, nível, bloqueio, senha, condomínios do morador).
- Minha conta: trocar a própria senha e sair.
- Visual refeito: cartões arredondados, barra de abas flutuante, animações, fonte Plus Jakarta Sans.
- Marca d'água com o nome do usuário sobre todas as imagens de câmera.
- Nomes de condomínio exibidos com maiúsculas e minúsculas e acentos.
