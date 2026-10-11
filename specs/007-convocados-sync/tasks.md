---

description: "Task list for Robustez da seleção de convocados"
---

# Tasks: Robustez da seleção de convocados

**Input**: Design documents from `/specs/007-convocados-sync/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: Incluídos — mesmo padrão já usado em todas as features anteriores deste
projeto (Vitest puro em `packages/engine/test/`, Princípio IV da constituição).

**Organization**: Tarefas agrupadas por User Story (spec.md), pra cada uma ser
implementável e testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (ficheiros diferentes, sem dependência entre si)
- **[Story]**: A qual User Story a tarefa pertence (US1/US2/US3)

---

## Phase 1: Setup

**Purpose**: Nenhuma inicialização de projeto nova — feature inteira dentro do
monorepo já existente, reaproveitando o toolchain já configurado.

- [X] T001 Confirmar branch `007-convocados-sync` criada/checked out. Nenhuma
      dependência nova, nenhuma configuração de build nova — `packages/engine` e
      `apps/web` continuam exatamente como estão. Trabalho feito direto em `main`
      (convenção já estabelecida do projeto — sem branches de feature na prática).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Transformar convocado/titular num conceito event-sourced de verdade —
tipo de evento, derivação/merge por `ts`, e as funções do motor que passam a produzir
esses eventos. Nenhuma das 3 User Stories é possível sem isto (ver research.md
Decisões 1-3).

**⚠️ CRITICAL**: Nenhuma User Story começa antes desta fase.

- [X] T002 Adicionar 4 valores novos a `EventType` em `packages/engine/src/types.ts`:
      `"convocado_add"`, `"convocado_remove"`, `"titular_add"`, `"titular_remove"`
      (ver data-model.md). Também acrescentada a constante `SQUAD_EVENT_TYPES`
      (desvio do plano original, ver nota em T006).

### Tests for Foundational ⚠️

> Escrever estes testes PRIMEIRO, confirmar que falham antes de implementar.

- [X] T003 [P] Testes em `packages/engine/test/liveMatch.test.ts` para a derivação
      por "última ação vence" (research.md Decisão 2): dado uma lista de
      `MatchEvent`, `deriveConvocadoIds`/`deriveTitularIds` devolvem o conjunto
      correto; eventos fora de ordem (ts decrescente na lista) ainda produzem o
      resultado correto; `add` seguido de `remove` do mesmo atleta remove; `remove`
      seguido de `add` adiciona; eventos de outros tipos são ignorados; lista vazia
      devolve `[]`. 6 testes novos, todos passando.
- [X] T004 [P] Testes em `packages/engine/test/liveMatch.test.ts` para
      `toggleConvocado(state, playerId, nowMs)` e `toggleTitular(state, playerId,
      nowMs)` (nova assinatura, com `nowMs`): cada chamada acrescenta exatamente um
      `MatchEvent` do tipo certo a `state.events`; `convocadoIds`/`titularIds`
      resultantes batem com a derivação de T003; `toggleTitular` continua bloqueado
      quando `state.started` (comportamento já existente, não pode regredir);
      `toggleConvocado` funciona tanto com `state.started === false` quanto `true`
      (nunca teve essa guarda — não pode ganhar uma por engano). 3 testes novos.
      **Desvio**: os eventos vão pra `state.squadEvents`, não `state.events` — ver
      nota em T006.

### Implementation for Foundational

- [X] T005 Implementar `deriveConvocadoIds(events: MatchEvent[]): string[]` e
      `deriveTitularIds(events: MatchEvent[]): string[]` em
      `packages/engine/src/liveMatch.ts` (depende de T002; T003 deve falhar antes,
      passar depois). Nomes distintos da função já existente
      `titularIdsFromEvents` (que deriva do `lineup` do `kickoff`, uso diferente,
      ver research.md Decisão 7/data-model.md) — não confundir nem reaproveitar uma
      pela outra.
- [X] T006 Mudar a assinatura de `toggleConvocado`/`toggleTitular` em
      `packages/engine/src/liveMatch.ts` para `(state, playerId, nowMs)`: cada
      chamada cria o `MatchEvent` certo via `createEvent`, e recalcula
      `convocadoIds`/`onCourt` via T005. `toggleTitular` mantém a guarda
      `if (state.started) return state` exatamente como hoje.
      **Desvio do plano original** (ver research.md Decisão 3, revista): os
      eventos NÃO entram em `state.events` — `LiveMatchState` ganhou um campo
      novo, `squadEvents: MatchEvent[]`, separado por construção. Descoberto ao
      mapear os consumidores reais de `state.events` durante a implementação:
      ~10 funções/telas (describeEvents, buildTimelineData, foulsInPeriod,
      exportText, a aba Registo, os registos cronológicos de LiveMatch/
      MatchSummary/ReadOnlyMatch) leem `events` direto esperando só ações em
      quadra — misturar eventos de escalação ali exigiria filtrar em cada um
      desses sítios, um risco real de um deles aparecer como linha no registo
      do jogo. Separar evita essa classe de bug por construção, não só reduz a
      chance. `toggleTitular` recalcula `onCourt` (não `titularIds` — esse
      continua congelado por `goLive()`, intocado).
- [X] T007 Em `apps/web/src/match/useLiveMatch.ts`: `toggleConvocado`/
      `toggleTitular` passam a usar `Date.now()` (nunca `now()`, que em modo
      manual devolveria tempo de jogo, não um instante de parede real — o merge
      por `ts` precisa de um instante real) e um novo `applySquad()` (paralelo a
      `apply()`, opera sobre `squadEvents`) — enfileira os eventos novos na
      fila de sincronização SEM entrar na pilha de undo, preservando a
      intenção já documentada no ficheiro. A lógica de enfileirar foi extraída
      pra `enqueueNewEvents()`, partilhada por `apply()` e `applySquad()`.
      **Trabalho adicional não previsto no plano original**: os 4 pontos que já
      liam `match_events` direto do Supabase (`checkRemote` neste ficheiro,
      `useLiveMatchPoint.ts`, `ReadOnlyMatch.tsx`, `MatchEventEditor.tsx`)
      precisaram excluir `SQUAD_EVENT_TYPES` das suas consultas, pra não deixar
      eventos de escalação vazarem pro registo cronológico/timeline/Registo
      dessas telas (mesmo motivo do desvio de T006). `checkRemote` também
      passou a unir o heurístico de sempre com `deriveConvocadoIds` sobre
      `squadEvents` — preserva jogos de antes desta feature (sem nenhum
      `squadEvents`) continuando a funcionar só com o heurístico.

**Checkpoint**: Fundação pronta — convocado/titular já são eventos sincronizados de
verdade neste aparelho. User Stories podem começar.

---

## Phase 3: User Story 1 - A seleção de convocados nunca se perde antes do apito (Priority: P1) 🎯 MVP

**Goal**: Reabrir o mesmo jogo (ainda não iniciado) em qualquer aparelho/sessão
mostra a seleção de convocados/titulares tal como foi deixada — nunca uma lista
vazia, mesmo depois de trocar de aparelho, recarregar, ou ficar offline a meio.

**Independent Test**: quickstart.md Cenário 1 (trocar de aparelho/sessão, offline) e
Cenário 4 (duas abas do mesmo utilizador convergindo).

### Implementation for User Story 1

- [X] T008 [US1] Novo efeito em `apps/web/src/match/useLiveMatch.ts`, ativo só
      enquanto `!state.started`: a cada ~10s (já na 1ª execução, sem esperar o
      intervalo), busca em `match_events` (Supabase, filtrado por
      `SQUAD_EVENT_TYPES`) os eventos deste `matchId` cujo `client_event_id`
      ainda não está em `state.squadEvents`, acrescenta-os, e recalcula
      `convocadoIds`/`onCourt` via T005 — nunca reenfileira (já vieram do
      servidor). Mesmo padrão de poll já usado por `useLiveMatchPoint.ts`.
      Implementado JUNTO com o ajuste de `checkRemote` em T007 (ambos tocam a
      mesma área do ficheiro) — ver research.md Decisão 4.
- [X] T009 [US1] Verificação manual: Cenário 1 de `quickstart.md`, contra um
      jogo de teste novo (`teste5`, scheduled, criado só pra esta verificação).
      Confirmado via leitura direta do Supabase: 5 marcações de convocado
      sincronizaram corretamente; depois de simular "trocar de aparelho"
      (limpar `localStorage` de `teambench.liveMatch.*`/`teambench.outbox` e
      recarregar), a seleção de 5 convocados reapareceu idêntica — a causa raiz
      do incidente real está corrigida. Confirmado também que a aba Registo/o
      registo cronológico ao vivo mostra só o evento de `kickoff` (1), nunca os
      5 `convocado_add` — a separação `squadEvents`/`events` (T006) funciona
      na prática, não só em teste unitário.
      **Cenário 4 (duas abas) NÃO verificado ao vivo**: `localStorage` é
      partilhado entre abas da mesma origem no mesmo navegador, então duas
      abas não simulam dois aparelhos de verdade (teriam o mesmo estado local
      sempre) — simular isso exigiria um 2º perfil de navegador/incógnito.
      A correção do merge concorrente (última ação vence por `ts`, incluindo
      fora de ordem) já está coberta por teste unitário dedicado (T003); o
      caminho de busca+fusão em si (T008) já foi verificado funcionando contra
      o Supabase real no Cenário 1. Risco residual considerado baixo.

**Checkpoint**: User Story 1 funcional e testável de forma independente — a causa
raiz do incidente real está corrigida.

---

## Phase 4: User Story 2 - Chamar um atleta ao banco mesmo depois do apito (Priority: P2)

**Goal**: Durante o jogo ao vivo, o treinador consegue adicionar ao banco um atleta
que não estava nos convocados originais, a qualquer momento.

**Independent Test**: quickstart.md Cenário 2.

### Implementation for User Story 2

- [ ] T010 [US2] Em `apps/web/src/match/LiveMatch.tsx`: botão "+ Chamar atleta"
      perto do cabeçalho "Banco", abrindo um seletor sobre
      `roster.filter(p => !state.convocadoIds.includes(p.id))` — ao escolher um
      atleta, chama `live.toggleConvocado(id)` (já produz e sincroniza o evento
      certo desde a Foundational, funciona sem guarda de `started` desde sempre).
      Mesmo padrão visual dos pickers já existentes neste ficheiro (ex.: escolher
      quem sai pra entrar). Depende de T006, T007.
- [ ] T011 [US2] Verificação manual: Cenário 2 de `quickstart.md`.

**Checkpoint**: User Stories 1 e 2 funcionam juntas — o cenário completo do
incidente real (seleção incompleta + impossível adicionar depois) está coberto.

---

## Phase 5: User Story 3 - Aviso de poucos convocados (Priority: P3)

**Goal**: Ao marcar convocados antes do apito, um aviso não-bloqueante aparece se a
contagem ficar abaixo do mínimo configurado pro Formato de Jogo daquele jogo.

**Independent Test**: quickstart.md Cenário 3.

### Implementation for User Story 3

- [ ] T012 [US3] Migração `supabase/migrations/0025_match_format_min_convocados.sql`:
      `alter table match_formats add column min_convocados int;` (nullable, sem
      CHECK — ver data-model.md). Não aplicar sozinho — fica pendente de o
      treinador rodar no SQL Editor do Supabase, mesmo processo já estabelecido
      nas migrações anteriores (ver T018).
- [ ] T013 [US3] Estender `apps/web/src/team/useMatchFormats.ts`: adicionar
      `minConvocados: number | null` a `MatchFormatRow`/`NewMatchFormat`, incluir
      `min_convocados` no `select`/`insert`, e criar `updateFormat(id, patch)` —
      não existe NENHUMA forma de editar um formato já criado hoje (hoje só há
      `addFormat`/`setDefault`), necessário pra formatos já em uso (ex.: "SUB-15
      DIVISÃO ELITE", já usado em jogos reais) poderem ganhar um mínimo. Depende de
      T012.
- [ ] T014 [US3] Estender `apps/web/src/team/MatchFormats.tsx`: campo "Mín.
      convocados (opcional)" no formulário de criar formato, E uma affordance de
      EDITAR um formato já existente (hoje só lista + "Tornar padrão") usando
      `updateFormat` de T013. Depende de T013.
- [ ] T015 [US3] Em `apps/web/src/match/PreMatch.tsx`: aviso não-bloqueante quando
      `convocados.length < format.minConvocados` (só quando `minConvocados` não é
      `null` — FR-013); desaparece sozinho assim que a contagem atinge o mínimo,
      sem estado extra (reage direto a `convocados.length`). Depende de T013.
- [ ] T016 [US3] Verificação manual: Cenário 3 de `quickstart.md`.

**Checkpoint**: As 3 User Stories funcionam juntas.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T017 [P] Atualizar `docs/ARCHITECTURE.md` (Princípio VI) — documentar que
      convocados/titulares agora são event-sourced via `match_events` (não mais só
      `localStorage`), com merge entre aparelhos por "última ação vence" (`ts`) —
      ver research.md Decisões 1-3.
- [ ] T018 Pedir ao treinador pra aplicar a migração `0025` manualmente no SQL
      Editor do Supabase (mesmo processo já estabelecido nas migrações anteriores
      desta sessão/projeto) — nunca aplicada automaticamente.
- [ ] T019 Rodar os Portões de Qualidade da constituição antes do push:
      `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`,
      `npm run build --workspace apps/web`.
- [ ] T020 Regressão: secção "Regressão" de `quickstart.md` — um jogo pré-existente
      (sem nenhum evento `convocado_*`/`titular_*`, seleção feita do jeito antigo)
      continua a abrir sem quebrar (lista de convocados fica vazia nesse caso, que
      já é o comportamento aceito hoje pra um jogo começado do zero).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — T001 é só uma checagem.
- **Foundational (Phase 2)**: Depende do Setup. BLOQUEIA as 3 User Stories.
- **User Story 1 (Phase 3)**: Depende só do Foundational.
- **User Story 2 (Phase 4)**: Depende só do Foundational (T006/T007) — não depende
  de US1 estar pronto; o treinador já consegue chamar um atleta ao banco mesmo que
  o merge entre aparelhos (US1) ainda não exista, só não teria a garantia de isso
  sobreviver a trocar de aparelho antes do apito (que é precisamente o que US1
  resolve).
- **User Story 3 (Phase 5)**: Depende só do Foundational — totalmente independente
  de US1/US2 (lê `format.minConvocados` e `convocados.length`, nenhum dos dois
  depende do merge entre aparelhos ou do botão de chamar atleta).
- **Polish (Phase 6)**: Depende de todas as User Stories desejadas estarem
  completas.

### Dentro de cada User Story

- Testes (Foundational) escritos e FALHANDO antes da implementação (T003/T004 antes
  de T005/T006).
- T005/T006 (derivação + eventos de toggle) são implementadas uma vez na
  Foundational e reaproveitadas por TODAS as 3 User Stories — não duplicar.

### Parallel Opportunities

- T003 e T004 (testes Foundational) podem ser escritos em paralelo — ambos no mesmo
  ficheiro (`liveMatch.test.ts`) mas blocos `describe` independentes; considerar
  sequencial se preferir evitar conflito de edição no mesmo ficheiro.
- Depois da Foundational pronta: US1 (T008-T009), US2 (T010-T011) e US3
  (T012-T016) podem ser implementadas em qualquer ordem entre si — nenhuma depende
  das outras.
- T017 e T019/T020 (Polish) podem rodar em paralelo entre si (docs vs.
  testes/regressão).

---

## Parallel Example: Foundational

```bash
# T002 primeiro (tipo novo, bloqueia os testes). Depois, em paralelo:
Task: "Testes para deriveConvocadoIds/deriveTitularIds em packages/engine/test/liveMatch.test.ts"
Task: "Testes para toggleConvocado/toggleTitular (nova assinatura) em packages/engine/test/liveMatch.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia as 3 User Stories)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: testar User Story 1 de forma independente (quickstart
   Cenário 1 + 4)
5. É o suficiente pra corrigir a causa raiz do incidente real — US2/US3 são rede de
   segurança e prevenção adicionais, não bloqueiam a entrega do MVP

### Incremental Delivery

1. Setup + Foundational → fundação pronta (convocado/titular event-sourced)
2. US1 → testar independente → a seleção nunca mais se perde entre aparelhos
3. US2 → testar independente → nunca mais precisa parar de registar por falta de
   um atleta na lista
4. US3 → testar independente → aviso cedo de esquecimento genuíno
5. Cada entrega soma valor sem quebrar a anterior
