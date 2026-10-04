# CMPort App (Android)

Aplicativo de monitoramento de câmeras da CMPort. Consome a API do `cmport-system`
(`/api/v1`) — não tem backend próprio.

**Stack:** Expo SDK 57 · React Native 0.86 · TypeScript · Expo Router · react-native-webrtc

## O que já faz

1. **Login** com o mesmo email/senha do sistema web (`POST /auth/login`). O token JWT (8h)
   fica no armazenamento seguro do aparelho; ao expirar, volta pra tela de login.
2. **Condomínios** — lista com busca; os que têm postes cadastrados aparecem primeiro.
3. **Câmeras do condomínio** — agrupadas por poste, mais as câmeras avulsas.
4. **Ao vivo** — vídeo via WebRTC, com o mesmo fluxo do `CameraPlayer` do site: o app manda
   o SDP pro backend (`POST /cameras/{id}/webrtc`) e nunca fala direto com o MediaMTX.

5. **Gravações** — na tela da câmera: escolhe o dia (últimos 7), vê as 24 horas com as que
   tiveram movimento em azul e abre os trechos de cada hora.
6. **Tema branco ou preto** — botão no topo do painel e do login; a escolha fica salva.

Só câmeras `RTMP_ISOLADA` têm vídeo ao vivo (limitação do backend).

7. **Postes** (aba) — painel coletivo: totais, postes por condomínio, câmeras online. Tocar num
   poste abre o painel individual dele (situação, datas, observação, câmeras e estado de cada uma).
8. **Administração** (aba, só para administradores) — escolher um condomínio e criar, editar,
   desativar e reativar postes e câmeras; ver e enviar o endereço RTMP da câmera; gerar chave nova.
   Quem tem o papel DEV também cria usuários, troca o papel e bloqueia o acesso.

### Perfis

O backend tem três papéis. O app trata `ADMIN` e `DEV` como **administrador** e `USUARIO` como
**morador** (`src/lib/acesso.ts`). Morador não vê a aba nem consegue abrir as telas de administração.

> **Isto só esconde as telas.** Hoje o backend aceita criar e editar poste e câmera de qualquer
> usuário logado; só "gerar chave nova" exige administrador. A trava real precisa entrar no servidor.

### Pendências conhecidas

- **Gravações ainda não conectadas de verdade.** Produção tem a rota `GET /cameras/{id}/gravacoes`,
  mas o formato da resposta foi suposto (o código dela não está na cópia local do cmport-system).
  O ajuste fica todo em `src/lib/gravacoes.ts`.
- **Estado online/offline não confirmado.** Produção tem `GET /cameras/{id}/saude`, mas o formato foi
  suposto (`src/lib/saude.ts`). Se for outro, as telas mostram "Sem informação".
- **Painel mostra todo condomínio com poste.** O backend ainda não tem vínculo usuário ↔ condomínio;
  quando tiver, o filtro entra em `src/lib/acesso.ts`.

## Estrutura

```
src/app/                rotas (Expo Router)
  _layout.tsx           navegação + proteção por login
  login.tsx
  index.tsx             condomínios
  condominio/[id].tsx   postes e câmeras
  camera/[id].tsx       ao vivo
src/components/CameraPlayer.tsx
src/contexts/AuthContext.tsx
src/lib/                api (fetch), config, tipos, cores
```

## Pré-visualizar no PC (navegador)

```bash
npm run web      # abre em http://localhost:3000
```

No navegador, aperte F12 e ative o modo celular (Ctrl+Shift+M) para ver no formato de tela
de telefone. A porta precisa ser a 3000: a API só aceita chamadas de navegador vindas de
`http://localhost:3000` (CORS). Se o front web do cmport-system estiver rodando nessa porta,
pare-o antes.

## Rodar no Android

O app usa código nativo (WebRTC), então **não abre no Expo Go** — precisa de um build de
desenvolvimento instalado no celular.

```bash
npm install

# 1) gerar o APK de desenvolvimento na nuvem (não precisa de Android Studio)
npx eas-cli@latest login
npm run build:dev          # baixa e instala o APK no celular

# 2) subir o servidor de desenvolvimento e abrir o app no celular
npm start
```

APK avulso para testar sem servidor de desenvolvimento: `npm run build:apk`.

Com Android Studio + JDK 17 instalados, `npm run android` compila e instala localmente.

## Configuração

Por padrão o app aponta para produção (`https://dash.cmport.com.br/api/v1`). Para usar um
backend local, crie `.env.local`:

```
EXPO_PUBLIC_API_URL=http://<ip-da-maquina>:8000/api/v1
```

## Verificação

```bash
npm run typecheck
npx expo-doctor
```

## Sistema de design

Tudo que é cor, medida e fonte mora em `src/lib/tema.ts`, em três camadas:

| Camada | O que guarda | Exemplos |
|---|---|---|
| Primitivos | valores crus, sem significado (não exportados) | `azul600`, `marinho900` |
| Semânticos | o que o valor significa, por tema | `paletas.claro.fundo`, `c.azul`, `c.textoSuave` |
| Componentes | medidas de cada peça | `componentes.botao.altura`, `componentes.poste.trilho` |

Escalas: `espaco` (base 4), `raio`, `corpo` (tamanho de fonte), `entrelinha`.

Regra: nenhuma tela escreve hex, raio ou espaçamento na mão. Para mudar o azul do app, o
tamanho dos botões ou criar um terceiro tema, mexe-se só em `tema.ts`. Estilos que dependem
do tema usam `useEstilos(criarEstilos)`.
