# CM Port — aplicativo de câmeras

> **Este é o aplicativo dos MORADORES (uso externo).** Desde 08/10/2026 o projeto tem dois aplicativos: este, só com câmeras (morador assiste ao vivo; síndico também puxa gravações e cuida dos moradores do condomínio), e o dos técnicos, com gestão e monitor, em repositório separado. O restante deste arquivo foi escrito antes da separação e ainda cita telas que saíram daqui.


Aplicativo da CM Port para acompanhar as câmeras dos condomínios: vídeo ao vivo, gravações
e a administração de postes, câmeras e usuários. Roda no Android e no navegador, com o mesmo
código.

O app não tem servidor nem banco de dados próprios. Ele conversa com a API do sistema da
CM Port (a mesma do painel web), então os logins, os condomínios, as câmeras e as gravações
são os mesmos nos dois.

## O que ele faz

**Para quem assiste**

- **Início**: quantas câmeras estão no ar, o que precisa de atenção e os condomínios da pessoa.
- **Câmeras**: a parede com a imagem mais recente de cada câmera.
- **Ao vivo**: o vídeo da câmera em tempo real.
- **Gravações**: a linha do tempo do dia com os movimentos marcados, zoom, velocidade de 1× a
  16× e os eventos de movimento em miniaturas.
- **Baixar gravação**: escolhe-se de que horas a que horas; sai um vídeo só, com a marca d'água
  gravada dentro da imagem.
- **Minha conta**: dados pessoais, tema claro ou escuro e troca de senha.

**Para quem administra** (aba Gestão)

- Cadastro de postes e câmeras, inclusive várias de uma vez.
- Diagnóstico: conexão, qualidade do vídeo e espaço de gravação de cada câmera.
- Uso da nuvem de gravações.
- Usuários: criar, mudar o nível, bloquear, redefinir senha e escolher o que cada morador vê.

## Níveis de acesso

| Nível | O que faz no app |
|---|---|
| Desenvolvedor, Administrador master | Tudo, inclusive usuários |
| Administrador, Técnico | Assiste e administra postes e câmeras |
| Usuário | Assiste |
| Morador | Assiste só os postes e as câmeras liberados para ele |

O nível Morador depende de uma atualização do servidor que ainda não foi publicada
(ver [PENDENCIAS.md](PENDENCIAS.md)).

## Marca d'água

Toda imagem de câmera leva a identificação de quem está vendo. Na tela, é uma assinatura
pequena que troca de canto. No vídeo baixado, o nome, o número do login e a data ficam
repetidos pelo quadro inteiro, bem transparentes, de modo que cortar um canto não a remove.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
npm install
npx expo start --web --port 3000
```

Abra `http://localhost:3000`. A porta precisa ser a 3000: a API só aceita o app local nesse
endereço.

O app aponta para a API de produção. Para usar outra, crie um arquivo `.env.local`:

```
EXPO_PUBLIC_API_URL=http://endereco-da-api:8000/api/v1
```

Atenção: apontando para a produção, o que for alterado na aba Gestão é real.

### Conferir antes de enviar uma mudança

```bash
npx tsc --noEmit      # tipos
npx expo-doctor       # saúde do projeto
```

## Gerar o aplicativo Android

O APK é gerado na nuvem da Expo (EAS Build); não é preciso ter o Android Studio.

```bash
npm run build:apk     # APK de teste, instalável direto no celular
```

Ao terminar, a Expo devolve um link e um QR code para instalar.

O serviço de build usa o npm 10. Depois de instalar ou atualizar uma dependência, refaça o
arquivo de travamento com a mesma versão, senão o build para logo no início:

```bash
npx npm@10.9.8 install
npx npm@10.9.8 ci --dry-run
```

## Como o código está organizado

```
src/
  app/            as telas (Expo Router: cada arquivo é uma rota)
    (abas)/       Início, Câmeras, Postes e Gestão
    admin/        cadastros, diagnóstico e usuários
    camera/       a tela de uma câmera (ao vivo e gravações)
  components/     as peças das telas
    ui.tsx        o kit visual: cartões de vidro, topo, botões
    arte.tsx      fundo, ilustrações e ícones, em vetor
    Gravador.*    o download com marca d'água (um arquivo por plataforma)
  contexts/       sessão de quem está logado e tema
  lib/            conversa com a API e regras
    tema.ts       cores, medidas e fontes — a única fonte de estilo do app
    gravador/     o código que grava a marca no vídeo
scripts/          geração da página usada pelo download no Android
```

Alguns pontos que ajudam a entender o projeto:

- **Estilo**: nenhuma tela escreve cor, raio ou espaçamento cru. Tudo vem de `src/lib/tema.ts`.
- **Arquivos por plataforma**: quando o Android e o navegador precisam de código diferente,
  há dois arquivos com o mesmo nome (`CameraPlayer.tsx` e `CameraPlayer.web.tsx`, por exemplo).
- **Download com marca**: o vídeo é regravado no próprio aparelho, sem passar por servidor.
  No navegador, direto; no Android, dentro de uma página invisível que usa o mesmo código.
  Essa página (`src/lib/gravador/pagina.ts`) é gerada a cada `npm install` e não vai para o git.

## Tecnologia

Expo SDK 57, React Native, TypeScript e Expo Router. Vídeo ao vivo por WebRTC
(`react-native-webrtc`), gravações com `expo-video` e regravação de vídeo com `mediabunny`.

## O que falta

A lista do que está pendente e do que foi feito recentemente fica em
[PENDENCIAS.md](PENDENCIAS.md).
