# Checkpoint documental — configuração, auditoria e correções (2026-10-18)

Registo de sessão, não um documento vivo de arquitetura (esse papel continua a
ser de `docs/ARCHITECTURE.md`/`docs/SECURITY.md`). Não transcreve a conversa
nem logs completos — resume o que foi concluído, como foi verificado, e o que
fica pendente.

## 1. Contexto e âmbito

**Stack identificado nesta sessão**: monorepo npm (`packages/engine`,
`packages/db-tests`, `apps/web`); `apps/web` é Preact + Vite + PWA
(`vite-plugin-pwa`) com Supabase como backend (`@supabase/supabase-js`);
`packages/db-tests` usa PGlite (Postgres embutido, sem rede) para testar SQL
de `supabase/migrations/`; deploy via GitHub Pages (`.github/workflows/deploy.yml`,
dispara em push para `main` ou acionamento manual `workflow_dispatch`).

**Objetivos da revisão**: (1) validar a configuração do Claude Code para este
repositório; (2) auditoria estática coordenada (segurança, arquitetura,
código, QA) sobre o estado do repositório; (3) investigação dirigida e
correção de dois riscos de dados priorizados a partir dessa auditoria.

**Âmbito efetivamente inspecionado**: `supabase/migrations/` (as 26
originais + a nova 0027), `apps/web/src/sync/`, partes de
`apps/web/src/match/` e `apps/web/src/App.tsx`, `docs/SECURITY.md`,
`docs/ARCHITECTURE.md` (lidos, não alterados), `.github/workflows/deploy.yml`.

**Lacunas conhecidas de cobertura**: a maior parte de `packages/engine/src`
(rotações, relatórios, planeamento), grande parte de `apps/web/src/match/` e
`apps/web/src/team/` além dos ficheiros tocados, a maioria das migrations SQL
em detalhe, e specs além de `001-multi-user-access`/`002-multi-team-navigation`
citadas lateralmente.

**Isto não é uma certificação de segurança nem uma auditoria exaustiva.** É
uma revisão estática, por amostragem, com verificação local (PGlite/Vitest)
— nunca contra um Supabase real, nunca com acesso à produção.

## 2. Estado de referência

- Branch deste checkpoint: `claude/fervent-fermi-q3zk57`.
- Commit deste checkpoint: `6f6224c811691c2acc38477434bcee2fda89a429` (já
  enviado para `origin` antes deste documento).
- **`main`: não observado nesta sessão.** Não há referência local
  (`origin/main`) em cache neste checkout (`git branch -r` só lista
  `origin/claude/fervent-fermi-q3zk57`), e o uso de rede está fora do âmbito
  desta etapa — não se apresenta aqui nenhum estado de `main`, nem antigo nem
  atual.
- **Produção (GitHub Pages) e estado efetivo do Supabase: não verificados**
  em nenhum momento desta sessão. Nenhuma migration foi aplicada a um
  Supabase real; nenhum deploy foi feito ou observado.

## 3. Lotes concluídos

### Lote A — Configuração (`eebce36354d03d6682bb289744d3cd2a07d3b8b7`)
- **Objetivo**: validar que `CLAUDE.md`, a constituição e os agentes em
  `.claude/agents/` estavam coerentes e carregados como esperado.
- **Solução**: inspeção estática dos sete ficheiros de configuração;
  invocação limitada do `code-reviewer` (só Read/Glob/Grep) comparando a
  tabela de comandos do `CLAUDE.md` com `package.json` da raiz.
- **Ficheiros consultados** (lidos; nenhum modificado por esta auditoria):
  `CLAUDE.md`, `.specify/memory/constitution.md`, `.claude/agents/*.md`,
  `package.json` da raiz.
- **Verificações**: sem testes, build ou scripts do projeto — houve apenas
  inspeção local (leitura) e uma invocação de leitura do `code-reviewer`
  (só Read/Glob/Grep).
- **Limitações**: não cobre se o carregamento automático é feito por um
  mecanismo específico do runtime — só que o conteúdo estava disponível no
  contexto inicial.
- **Estado**: commit pré-existente no início da sessão, já na branch antes
  desta auditoria começar; não se afirma aqui o que esse commit em si
  alterou (não foi inspecionado o seu diff) — só que nem a constituição nem
  os agentes foram alterados por este Lote A, que foi só leitura.

### Lote B — Integridade entre `match_events` e `matches` (`3880323a804be252c77d8c9b0421e793a9725884`)
- **Problema**: `match_events.team_id` podia ficar inconsistente com o
  `team_id` real do jogo (`matches`) referenciado por `match_id` — sem
  nenhuma proteção no INSERT, e contornável no UPDATE mesmo com a flag
  `correcao:true` da migração 0026.
- **Solução**: migração `supabase/migrations/0027_match_events_team_consistency.sql`
  — FK composta `match_events (match_id, team_id) → matches (id, team_id)`,
  `NOT VALID`, `ON DELETE CASCADE`, sem `ON UPDATE CASCADE` (mover um jogo
  com eventos consistentes passa a ser rejeitado, não silenciosamente
  ignorado).
- **Ficheiros principais**: `supabase/migrations/0027_match_events_team_consistency.sql`,
  `packages/db-tests/test/matchEventsTeamConsistency.test.ts`.
- **Testes/verificações realizadas**: 32 testes em `packages/db-tests`
  (7 pré-existentes + 25 novos, incluindo cenários de dados legados
  inconsistentes criados antes da migração); `tsc -p packages/db-tests`
  limpo; revisão por `security-auditor` e `code-reviewer`.
- **Limitações**: dados já existentes em `match_events` não foram validados
  nem corrigidos (`NOT VALID`); um jogo cujo único evento já estava
  inconsistente ANTES da migração não fica protegido contra uma nova
  mudança de equipa (documentado no próprio SQL); `player_id`/transferência
  de atletas entre equipas fica deliberadamente fora — ver secção 7.
- **Estado**: commitado na branch; **não aplicado a nenhum Supabase real**;
  sem merge, sem deploy.

### Lote C — Isolamento da outbox por utilizador (`6f6224c811691c2acc38477434bcee2fda89a429`)
- **Problema**: a fila de sincronização local (`apps/web/src/sync/outbox.ts`)
  usava uma única chave global de `localStorage`, partilhada entre contas no
  mesmo aparelho (relevante porque "tablet do clube partilhado" é o modo de
  uso documentado em `docs/SECURITY.md`); corrupção de JSON era tratada
  como fila vazia; e, numa correção posterior, o próprio estado de UI
  (pendentes/avisos) podia mostrar números da conta anterior à conta nova,
  num cenário sem desmontagem de componente (sincronização de sessão entre
  separadores do mesmo browser).
- **Solução**: chave por `teambench.outbox.<ownerId>`; leitura tageada
  (`"ok"|"corrupted"`, nunca coalescida); quarentena separada por
  proprietário quando a fila principal está corrompida; `createOutboxFlusher`
  extraído e fechado sobre o `ownerId` por closure; `createOutboxSyncController`
  com invalidação por EXECUÇÃO do efeito (não por comparação de `ownerId` —
  cobre a sequência A → B → A); `reconcileStatus` devolve estado neutro
  durante a transição em vez do snapshot do proprietário anterior.
- **Ficheiros principais**: `apps/web/src/sync/outbox.ts`,
  `outboxFlusher.ts`, `useOutboxSync.ts`, `apps/web/src/match/useLiveMatch.ts`,
  `apps/web/src/App.tsx`, `MatchHub.tsx`, `MatchFlow.tsx`.
- **Testes/verificações realizadas**: 27 testes novos em `apps/web`
  (armazenamento puro + coordenação assíncrona com Promises controladas +
  controlador de invalidação); `tsc -p apps/web` e `npm run build --workspace
  apps/web` limpos nas execuções reportadas; revisão por `security-auditor`
  e `code-reviewer`, incluindo uma rodada de correção após um problema de UI
  encontrado na verificação final.
- **Limitações**: ver secção 6.
- **Estado**: commitado e **já enviado (push) para `origin/claude/fervent-fermi-q3zk57`**;
  sem merge para `main`, sem deploy.

## 4. Evidências de testes

Cada número abaixo vem de uma execução reportada num momento diferente desta
sessão — **não correram todos juntos numa única invocação**, e `npm test` na
raiz continua a não incluir a suite de `apps/web`.

| Pacote | Testes | Execução reportada após |
|---|---|---|
| `packages/engine` | 176 passaram | baseline inicial e reconfirmado após o Lote B |
| `packages/db-tests` | 32 passaram | Lote B (migração 0027) |
| `apps/web` (novo, `vitest`) | 27 passaram | última correção do Lote C |

Typecheck (`tsc --noEmit`) e `npm run build --workspace apps/web` passaram
nas execuções reportadas ao longo da sessão, mas **não foram todos
re-executados juntos no commit final** — alguns foram confirmados logo após
cada alteração relevante, não repetidos depois.

**Não se afirma que a qualidade de todos os testes foi auditada** — os
revisores (`qa-expert`, `code-reviewer`) inspecionaram amostras (4 ficheiros
de teste do engine na auditoria inicial; os novos ficheiros de `db-tests` e
`apps/web` nos lotes B e C), não a suite inteira.

**Node**: execução local sob Node v22.22.0; `.github/workflows/deploy.yml`
fixa Node 20 (`setup-node@v4`). Isto foi observado na baseline inicial desta
sessão — **não há verificação de equivalência entre as duas versões**; os
testes e builds desta sessão correram só sob Node 22.

## 5. Migration 0027 — estado e limites

- Criada e testada **apenas em PGlite** (`packages/db-tests`), nunca aplicada
  a um Supabase real.
- FK composta `(match_id, team_id) → matches(id, team_id)`, adicionada com
  `NOT VALID` — não escaneia nem valida linhas já existentes em
  `match_events`.
- **Dados antigos em produção não foram verificados nem corrigidos** — se
  alguma linha já inconsistente existir, continua sem marca até uma
  validação dedicada.
- Limite observado e testado com linhas legadas: um jogo cujo único evento
  associado já era inconsistente ANTES da migração não fica protegido
  contra uma nova mudança de `matches.team_id` (o mecanismo de restrição da
  FK só reconhece linhas já consistentes com a chave atual do jogo).
- **Aplicação a um Supabase real, levantamento de inconsistências
  existentes, e uma eventual validação (`VALIDATE CONSTRAINT`) exigem um
  plano separado** — não decidido nem agendado por este checkpoint.
- **Nenhuma garantia de duração de locks em produção**: `ADD CONSTRAINT ...
  UNIQUE` exige construir um índice (lock de escrita em `matches` por um
  tempo não estimado — depende de volume/carga reais, nunca medidos aqui).

## 6. Outbox — estado e limites

- Propriedade explícita por utilizador (`ownerId = session.user.id`) em
  todas as operações da fila — sem leitura de sessão dentro do módulo de
  armazenamento.
- Chave legada (sem sufixo) e conteúdo em quarentena são **preservados**,
  nunca atribuídos à conta atual nem sincronizados automaticamente — fica
  só um aviso de existência, sem conteúdo exposto.
- Quarentena por proprietário implementada para eventos que a fila
  principal (corrompida) não aceita; avisos de corrupção/quarentena/legado
  na UI.
- Invalidação por execução do efeito (não por comparação de `ownerId`) e
  `reconcileStatus` protegem contra publicação tardia de estado da conta
  anterior como se fosse da atual.
- **Testes cobrem o controlador extraído (`createOutboxSyncController`) e as
  funções reais exportadas — não o hook `useOutboxSync` montado num ciclo
  de vida Preact real** (sem harness de renderização em `apps/web`); a
  ligação entre controlador e hook foi verificada por leitura de código, não
  por execução.
- **UI não validada visualmente** em nenhum momento — nenhum navegador foi
  aberto.

## 7. Pendências priorizadas

**A — Bloqueiam disponibilizar a nova outbox:**
- Decisão e implementação de transição segura dos dados locais já pendentes
  (legado/quarentena) antes de expor isto a utilizadores reais.
- Validação visual real (navegador) dos avisos novos e do comportamento do
  hook montado.

**B — Preparação necessária para aplicar a migration 0027:**
- Plano de aplicação a um Supabase real (janela, lock, rollback).
- Levantamento de inconsistências já existentes em `match_events` antes ou
  depois de aplicar.
- Decisão sobre `VALIDATE CONSTRAINT` (quando e como).

**C — Lacunas de testes/CI:**
- Nenhum teste automatizado exercita RLS real (achado da auditoria inicial,
  não endereçado pelos Lotes B/C).
- Testes da proteção de "último admin" (migração 0017) continuam ausentes.
- `npm test` da raiz ainda não inclui a suite de `apps/web` — gate de
  qualidade da constituição corre em separado.
- Divergência de Node (22 local vs. 20 em CI) nunca testada por
  equivalência.
- O workflow de deploy (`.github/workflows/deploy.yml`) não executa
  nenhuma suite de testes (engine/db-tests/web) antes de publicar — só
  `npm ci` e `npm run build --workspace apps/web`. Isto é distinto do
  `tsc -b` já incluído nesse build: o build faz typecheck do código da web
  antes de gerar os assets — não há ausência total de verificação de
  tipos, só de testes automatizados.

**D — Hipóteses ainda não reproduzidas (condicionadas a um gatilho não
confirmado em runtime):**
- Duplicação de eventos se o updater de `setState` em `useLiveMatch.ts`
  alguma vez correr duas vezes para a mesma transição (gatilho não
  observado em runtime).
- Identidade de pedidos HTTP já em voo no intervalo entre o "ping" e o
  "upsert" do flush — risco arquitetural localizado no código, nunca
  reproduzido contra um cliente real.

**Limitações/comportamentos já caracterizados por teste (não são
hipóteses — demonstrados por um teste automatizado a passar, documentando
o comportamento atual, deliberadamente não corrigido):**
- Concorrência entre `flush()`es sobrepostos da MESMA conta (reentrância)
  — caracterizada por um teste que passa em `outboxFlusher.test.ts`,
  ortogonal ao isolamento entre contas.

**Achado conhecido, confirmado por leitura estática do código (não é
hipótese nem foi reproduzido em execução — o grau de confirmação
corresponde à evidência disponível: leitura direta da chamada única de
`upsert`, não um teste nem uma reprodução em runtime):**
- "Tudo-ou-nada" do upsert em lote (um item sem autorização bloqueando os
  restantes da mesma fila) — achado da auditoria inicial, anterior aos
  Lotes B/C, confirmado pela leitura do código de `useOutboxSync.ts`
  (um único `.upsert(items, ...)` por fila, remoção só `if (!error)`),
  não resolvido.

**E — Melhorias opcionais:**
- Não foi identificada funcionalidade de transferência no âmbito
  inspecionado; a regra sobre referências históricas de atletas permanece
  por decidir.
- Áreas de código ainda não revistas nesta sessão (ver secção 1, lacunas).

Nenhum item da lista D é apresentado como problema confirmado; nenhum item
de C recebe severidade alta só por ser ausência de teste; o achado do
upsert em lote mantém-se classificado como confirmado por leitura estática,
não convertido em hipótese nem em reprodução de runtime que não aconteceu.

## 8. Próximos lotes recomendados

- Transição segura dos dados locais (legado/quarentena) antes de
  disponibilizar a nova outbox — **bloqueante** para expor isto a
  utilizadores reais (depende de decisão de produto).
- Piloto de validação de UI com dados fictícios, sem Supabase real — pode
  correr em paralelo com o item seguinte.
- Reforço do gate de qualidade (incluir `apps/web` no `npm test` da raiz,
  decidir sobre a divergência de Node) — pode correr em paralelo com os
  dois itens acima.
- Testes de autorização/RLS reais (db-tests com simulação de papéis) — útil
  antes de qualquer plano de aplicação da 0027 a produção, mas não
  estritamente bloqueante para ela.
- Plano operacional da migration 0027 (aplicação, levantamento, validação)
  — a APLICAÇÃO a um Supabase real depende de um plano operacional
  aprovado, de uma verificação do estado real dos dados nesse momento, e
  de critérios de segurança definidos nesse plano (nenhum dos três
  decidido aqui); não depende automaticamente de todos os lotes de
  UI/testes propostos nesta lista — a preparação do plano pode correr em
  paralelo com eles, mas a aplicação em si só avança quando esses três
  requisitos próprios estiverem satisfeitos.

Esta lista não autoriza nenhum destes lotes — fica para decisão e
autorização explícita em separado.
