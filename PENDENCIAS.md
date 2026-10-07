# Pendências e melhorias

Atualizado em 06/10/2026. O que falta para o app ir a moradores e à Play Store, e o que vale
melhorar depois. A ordem dentro de cada bloco é a ordem sugerida.

## 1. Bloqueia a liberação para moradores

Sem estes itens, qualquer pessoa com login vê as câmeras de todos os condomínios.

- [ ] **Publicar a proposta de backend** (nível `MORADOR`, com acesso por poste e por câmera).
  Está pronta em `cmport-backend-proposta/` (fora deste repositório), no ramo
  `proposta-morador-postes`, com `PROPOSTA-MORADOR.md` e `proposta-morador-postes.patch`.
  Depende do responsável pelo `cmport-system` revisar e publicar. Enquanto isso, a ficha do
  morador no app avisa que a função ainda não existe no servidor.
- [ ] **Testar a proposta com um MySQL de verdade** antes do deploy: a migração da coluna `role`,
  as tabelas `usuario_postes` e `usuario_cameras` e as rotas `/usuarios/{id}/acessos` só foram
  testadas com testes unitários.
- [ ] **Backup do banco de produção** antes de publicar a proposta.
- [ ] **Criar os usuários moradores e marcar os postes e câmeras de cada um** (aba Gestão →
  Usuários), depois que o backend for publicado.

## 2. Nunca foi testado

- [ ] **Rodar num celular Android.** O app só foi visto no navegador e em capturas de tela.
  O APK de teste sai com `npm run build:apk` (a conta Expo já está configurada na máquina).
- [ ] **Vídeo ao vivo de verdade** no aparelho. A biblioteca `react-native-webrtc` consta como
  "não testada" na arquitetura nova do React Native.
- [ ] **Assistir uma gravação real** com a barra do tempo: tocar, ±10 s, velocidade até 16×, emenda
  automática entre os trechos de 1 minuto e zoom. Testado só com um vídeo de teste no navegador.
- [ ] **Conferir as telas com dados de produção**: miniaturas, estado online, saúde, diagnóstico.
- [ ] **Arrastar o dedo na barra do tempo no celular.** No navegador (mouse) está testado; no Android
  o gesto usa outro caminho do código e ainda não foi experimentado num aparelho.
- [ ] **Marca d'água sobre vídeo tocando**, inclusive na tela cheia do player de gravação.
- [ ] **Baixar gravação real**: vídeo em H.265 ou guardado na nuvem pode falhar, e o tempo de
  preparo de um intervalo longo (até 30 min) não foi medido.
- [ ] **Barra de uso da nuvem com dados de produção** (aba Gestão).

## 3. Hospedagem da versão web

- [ ] Registro DNS `app.cmport.com.br` apontando para a VPS.
- [ ] Certificado HTTPS para o novo endereço.
- [ ] Bloco no Nginx servindo o app e repassando `/api/v1/` ao backend (arquivos do `cmport-system`).
- [ ] Passo de deploy que gera a versão web (`npx expo export --platform web`) e envia para a VPS.
- [ ] No app: usar o endereço da API relativo quando rodar na web hospedada.

## 4. Play Store

- [ ] Conta de desenvolvedor no Google Play e conta na Expo.
- [ ] Pacote da loja (`eas build --profile production`).
- [ ] Política de privacidade publicada (o app mostra imagens de câmeras; envolve a LGPD).
- [ ] Login de teste para a revisão do Google.
- [ ] Nome, descrição e capturas de tela da página da loja.

## 5. Melhorias

- [ ] **Baixar gravação no Android.** Hoje só a versão web baixa (ela regrava o vídeo com a marca
  no navegador). No aparelho, o servidor precisa entregar o vídeo já marcado.
- [ ] **Uso exato da nuvem.** O número da barra é uma estimativa (o que cada câmera mandou nas
  últimas 24 h vezes os dias do plano). O valor exato depende de uma rota nova no servidor.
- [ ] **Logo em tamanho maior ou em vetor.** O arquivo recebido tem 150×150 pixels.
- [ ] **ID único por usuário na marca d'água.** Hoje usa o nome e o número do login; a troca é em
  `textoDaMarca()`, em `src/lib/acesso.ts`.
- [ ] **Nomes de condomínio:** siglas com vogal podem sair erradas na conversão de maiúsculas
  (ex.: "CDHU"). A lista de exceções fica em `src/lib/texto.ts`.
- [ ] **Avisos no celular** quando uma câmera cair (notificação push). Precisa de apoio do backend.
- [ ] **Abas Saúde e Configuração na tela da câmera**, como no sistema web. Hoje a saúde aparece em
  pílulas e num cartão de ajustes, e a configuração fica na aba Gestão.
- [ ] **Passagem sem pausa entre os trechos de 1 minuto** nas gravações (pré-carregar o próximo).
- [ ] **README:** foi esvaziado no GitHub; decidir se volta com as instruções de uso.
- [ ] **Vídeo ao vivo de câmera em gravador (NVR).** O backend só transmite câmeras `RTMP_ISOLADA`.
- [ ] **Tela cheia e rotação** no vídeo ao vivo.
- [ ] **Atualização sem loja** das telas (EAS Update), para corrigir sem esperar revisão do Google.
- [ ] **Testes automáticos** do app. Hoje a conferência é manual, por capturas de tela.
- [ ] **Manter compatibilidade da API** com versões antigas do app depois de publicado na loja.

## Feito recentemente

- Morador por poste e por câmera (06/10/2026): na ficha do morador, marca-se o que ele vê —
  postes inteiros e câmeras uma a uma. Depende da proposta de backend ser publicada.
- Visual novo em vidro (05/10/2026), a pedido do cliente: fundo azul-marinho com luzes, painéis
  translúcidos, entrada num cartão único. Logo nova, com ícone do app e favicon.
- Marca d'água discreta: uma assinatura pequena que troca de canto, e o mesmo texto quase
  invisível espalhado pela imagem.
- Baixar gravação (versão web): escolhe-se de que horas a que horas, até 30 minutos; sai um MP4
  só, com a marca e o relógio da gravação dentro do vídeo.
- Barra de uso da nuvem na aba Gestão, sobre os 500 GB contratados.
- Tocar no endereço da câmera copia o link.
- Corrigido: ao trocar de aba, a tela anterior aparecia por trás da nova.

- Barra do tempo das gravações aceita toque e arrasto: mostra o horário sob o dedo e vai para lá ao
  soltar. (Antes ela não respondia a nada — corrigido em 05/10/2026.)
- Gravações com barra do tempo, como no sistema web: linha do dia com os movimentos marcados, zoom
  (24 h, 6 h, 1 h, 15 min), anterior e próximo, ±10 s, velocidade de 1× a 16× e eventos de movimento
  em miniaturas. A tela da câmera ganhou as abas Ao vivo e Gravações.
- App ligado ao contrato real do backend: gravações, estado online, saúde e miniaturas.
- Gestão: postes, câmeras (retenção, correção de horário, mover de poste e de condomínio, criação
  em lote), diagnóstico e usuários (nome, nível, bloqueio, senha, condomínios do morador).
- Minha conta: trocar a própria senha e sair.
- Visual refeito: cartões arredondados, barra de abas flutuante, animações, fonte Plus Jakarta Sans.
- Marca d'água com o nome do usuário sobre todas as imagens de câmera.
- Nomes de condomínio exibidos com maiúsculas e minúsculas e acentos.
