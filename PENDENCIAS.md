# Pendências e melhorias — app dos moradores

Atualizado em 08/10/2026 (noite). Este é o aplicativo de **uso externo**: morador e síndico, só
câmeras. O aplicativo da equipe (gestão, monitor, usuários) fica em outro repositório.

## Onde estamos

- O app fala com o **serviço de cliente** (`https://dash.cmport.com.br/api/cliente/v1`), no ar desde
  08/10/2026. Login próprio de síndico e morador; o login da equipe não entra aqui.
- Testado em produção, no navegador, com a conta de síndico de teste (local 1053, 4 câmeras): listas
  com miniatura, câmera, saúde, **vídeo ao vivo com a marca d'água**, gravações com um trecho tocando,
  renovação do token, Minha conta, reabertura sem senha e o isolamento entre locais.
- Testado também com a conta de **morador** de teste: vê só a câmera liberada, assiste ao vivo, não
  tem aba de gravações (e o servidor recusa com 403), não vê o cartão de moradores.
- Ainda **não** testado em produção: baixar gravação, troca de senha de verdade, recusas de
  login, aparelho Android. O resultado completo está em `ROTAS-QUE-FALTAM.md`, na pasta do projeto.

## 1. Depende do servidor (próxima etapa do serviço de cliente)

- [ ] **Gestão de moradores pelo síndico**: listar, criar, bloquear, redefinir senha, liberar postes
  e câmeras, liberar troca de aparelho. A aba **Gestão** do síndico (`src/app/(abas)/gestao.tsx`) e a
  ficha (`src/app/sindico/morador.tsx`) estão prontas, com números de moradores e escolha de
  condomínio para síndico de vários locais; mostram um aviso enquanto o servidor não tem as rotas.
- [ ] **Cobrança por morador criado**: decidido para o futuro, nada feito. O servidor precisa guardar
  quem criou e quando.
- [ ] **Perfil e foto no servidor** (`PATCH /auth/me`, `/auth/me/foto`). Hoje ficam só no aparelho.
- [ ] **Recuperar senha por e-mail.** Sem data.
- [ ] **Soltar a conta de um aparelho** por alguma tela. Hoje só a equipe do servidor faz.

## 2. Falta testar

- [ ] Morador com **várias câmeras** e com **poste** liberado (a conta de teste tem uma câmera só).
- [ ] **Várias câmeras ao vivo de uma vez** na tela do condomínio (é a tela do morador).
- [ ] **Marca d'água**: o cliente ver no celular se a transparência está boa.
- [ ] **Baixar gravação** com a marca (síndico).
- [ ] **Sessão**: volta ao login depois de 30 dias.
- [ ] **Android**: tudo acima num aparelho de verdade. Precisa de um APK novo.

## 3. Para publicar na Play Store

O passo a passo e os textos estão fora do repositório, na pasta do projeto
(`PUBLICAR-NA-PLAY-STORE.md` e `PLAY-STORE-TEXTOS.md`).

- [ ] Conta no Google Play Console (organização ou pessoal).
- [ ] Política de privacidade publicada numa página.
- [ ] **Pedido de exclusão de conta** dentro do app e numa página web.
- [ ] Conta de demonstração para o revisor, sem a trava de aparelho.
- [ ] Capturas de tela com uma câmera no ar.
- [ ] Build de produção (AAB).

## 4. Decisões em aberto

- [ ] O login de **nível interno** neste app: o serviço de cliente já recusa, por ter login próprio.
  Conferir com uma conta da equipe.
- [ ] **Morador vê gravação?** O servidor decide por local (bloqueado por padrão); o app esconde
  sempre, por decisão do cliente.
- [ ] Levar aos temas novos também a **forma e a letra** (hoje mudam só as cores).

## 5. Limpeza de código

- [ ] `src/lib/resumo24h.ts`, `src/lib/nuvem.ts` e `UsoDaNuvem` em `components/central.tsx` não são
  mais usados por nenhuma tela deste app.
- [ ] `README.md` ainda descreve o app de antes da separação, abaixo da nota do topo.
- [ ] `scripts/conferir-api.js` confere o contrato só com leitura; exige o identificador do aparelho
  porque o primeiro login prende a conta.
