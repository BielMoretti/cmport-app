# Pendências e melhorias

Atualizado em 08/10/2026. O que falta para o app ir a moradores e à Play Store, e o que vale
melhorar depois. A ordem dentro de cada bloco é a ordem sugerida.

## 1. Decisões em aberto

- [ ] **Isolar o app numa API separada, ou usar o servidor atual com o nível Morador.** É a
  decisão que trava o resto. A proposta em discussão é um segundo serviço, feito do mesmo
  código do servidor, que só carrega as rotas do app e só tem a senha de um usuário de banco
  limitado — assim uma falha no app não alcança o financeiro.
- [ ] **Onde administrar os moradores**: aba Gestão do app, tela no painel web, ou os dois.
- [ ] **Aprovação do visual** pelo cliente.

## 2. Bloqueia a liberação para moradores

Sem estes itens, qualquer pessoa com login vê as câmeras de todos os condomínios.

- [ ] **Publicar no servidor o nível Morador**, com acesso por poste e por câmera. Há uma
  proposta pronta (fora deste repositório) para o servidor atual; se a decisão for pela API
  separada, ela é refeita nesse formato, aproveitando as regras e os testes.
- [ ] **Testar a parte do servidor com um MySQL de verdade** antes de publicar. Hoje ela passa
  em testes automáticos, mas nunca rodou com banco real.
- [ ] **Backup do banco de produção** antes de publicar.
- [ ] **Limite de tentativas de senha no login.** Hoje não existe.
- [ ] **Criar os moradores e marcar os postes e câmeras de cada um** (aba Gestão → Usuários),
  depois que o servidor for publicado.

## 3. Depende do servidor ser atualizado

O app já está preparado para estes itens; eles passam a funcionar sem nova versão.

- [ ] **Dados de "Minha conta"** (como quer ser chamado, telefone, nascimento, unidade). Hoje
  ficam guardados só no aparelho, e a tela avisa.
- [ ] **Sessão mais longa para o morador**, para não pedir a senha todo dia.
- [ ] **Uso exato da nuvem.** O número da barra é uma estimativa (o que cada câmera mandou nas
  últimas 24 h vezes os dias do plano).

## 4. Falta testar

- [ ] **Baixar gravação no celular Android.** O código que prepara o vídeo foi testado no
  navegador; gravar o arquivo no aparelho e salvar na galeria ainda não rodou.
- [ ] **Baixar gravação real**: vídeo em H.265 ou guardado na nuvem pode falhar, e o tempo de
  preparo de um intervalo longo não foi medido.
- [ ] **Arrastar o dedo na barra do tempo no celular.**
- [ ] **Marca d'água sobre vídeo tocando**, inclusive em tela cheia.
- [ ] **Telas com dados de produção**: miniaturas, estado online, diagnóstico, barra da nuvem.

## 5. Hospedagem da versão web

- [ ] Registro DNS `app.cmport.com.br` apontando para o servidor.
- [ ] Certificado HTTPS para o novo endereço.
- [ ] Bloco no Nginx servindo o app e repassando a API.
- [ ] Passo de deploy que gera a versão web (`npx expo export --platform web`) e a envia.
- [ ] No app: usar o endereço da API relativo quando rodar na web hospedada.

## 6. Play Store

- [ ] Conta de desenvolvedor no Google Play.
- [ ] Pacote da loja (`eas build --profile production`).
- [ ] Política de privacidade publicada (o app mostra imagens de câmeras; envolve a LGPD).
- [ ] Login de teste para a revisão do Google.
- [ ] Nome, descrição e capturas de tela da página da loja.

## 7. Melhorias

- [ ] **Logo em tamanho maior ou em vetor.** O arquivo recebido tem 150×150 pixels.
- [ ] **ID único por usuário na marca d'água.** Hoje usa o nome e o número do login; a troca é
  em `textoDaMarca()`, em `src/lib/acesso.ts`.
- [ ] **Nomes de condomínio:** siglas com vogal podem sair erradas na conversão de maiúsculas
  (ex.: "CDHU"). A lista de exceções fica em `src/lib/texto.ts`.
- [ ] **Avisos no celular** quando uma câmera cair (notificação push). Precisa de apoio do servidor.
- [ ] **Abas Saúde e Configuração na tela da câmera**, como no painel web.
- [ ] **Passagem sem pausa entre os trechos de 1 minuto** nas gravações.
- [ ] **Vídeo ao vivo de câmera em gravador (NVR).** O servidor só transmite câmeras `RTMP_ISOLADA`.
- [ ] **Tela cheia e rotação** no vídeo ao vivo.
- [ ] **Atualização sem loja** das telas (EAS Update).
- [ ] **Testes automáticos** do app. Hoje a conferência é manual, no navegador.
- [ ] **Manter compatibilidade da API** com versões antigas do app depois de publicado na loja.

## Feito recentemente

- **08/10/2026** — README com a explicação do sistema.
- **07/10/2026** — Primeiro APK de teste instalado e funcionando num celular Android.
- **07/10/2026** — Baixar gravação dentro do app Android (antes só na versão web), com limite de
  10 minutos por download no aparelho.
- **07/10/2026** — Marca d'água do vídeo baixado espalhada pelo quadro inteiro, bem transparente:
  cortar um canto não a remove mais.
- **07/10/2026** — "Minha conta" com dados pessoais (nome, como quer ser chamado, telefone,
  nascimento, bloco e apartamento), escolha do tema e versão do app.
- **07/10/2026** — Ícone do tema: sol no claro, lua no escuro.
- **06/10/2026** — Botão "Criar novo usuário" em destaque na aba Gestão e no topo da tela de
  usuários (antes o formulário ficava no fim da lista).
- **06/10/2026** — Morador por poste e por câmera: na ficha do morador, marca-se o que ele vê.
- **05/10/2026** — Visual novo em vidro, a pedido do cliente; logo nova, ícone do app e favicon.
- **05/10/2026** — Marca d'água discreta na tela: uma assinatura pequena que troca de canto.
- **05/10/2026** — Baixar gravação (versão web): escolhe-se de que horas a que horas; sai um MP4
  só, com a marca e o relógio da gravação dentro do vídeo.
- **05/10/2026** — Barra de uso da nuvem na aba Gestão, sobre os 500 GB contratados.
- **05/10/2026** — Tocar no endereço da câmera copia o link.
- **05/10/2026** — Corrigido: ao trocar de aba, a tela anterior aparecia por trás da nova.
- **05/10/2026** — Barra do tempo das gravações aceita toque e arrasto.
- **04/10/2026** — Gravações com barra do tempo, app ligado ao contrato real do servidor, gestão
  de postes, câmeras e usuários, e nomes de condomínio com maiúsculas, minúsculas e acentos.
