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

- [ ] T001 Confirmar branch `007-convocados-sync` criada/checked out. Nenhuma
      dependência nova, nenhuma configuração de build nova — `packages/engine` e
      `apps/web` continuam exatamente como estão.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Transformar convocado/titular num conceito event-sourced de verdade —
tipo de evento, derivação/merge por `ts`, e as funções do motor que passam a produzir
esses eventos. Nenhuma das 3 User Stories é possível sem isto (ver research.md
Decisões 1-3).

**⚠️ CRITICAL**: Nenhuma User Story começa antes desta fase.

- [ ] T002 Adicionar 4 valores novos a `EventType` em `packages/engine/src/types.ts`:
      `"convocado_add"`, `"convocado_remove"`, `"titular_add"`, `"titular_remove"`
      (ver data-model.md).

### Tests for Foundational ⚠️

> Escrever estes testes PRIMEIRO, confirmar que falham antes de implementar.

- [ ] T003 [P] Testes em `packages/engine/test/liveMatch.test.ts` para a derivação
      por "última ação vence" (research.md Decisão 2): dado uma lista de
      `MatchEvent`, `deriveConvocadoIds`/`deriveTitularIds` devolvem o conjunto
      correto; eventos fora de ordem (ts decrescente na lista) ainda produzem o
      resultado correto; `add` seguido de `remove` do mesmo atleta remove; `remove`
      seguido de `add` adiciona; eventos de outros tipos são ignorados; lista vazia
      devolve `[]`.
- [ ] T004 [P] Testes em `packages/engine/test/liveMatch.test.ts` para
      `toggleConvocado(state, playerId, nowMs)` e `toggleTitular(state, playerId,
      nowMs)` (nova assinatura, com `nowMs`): cada chamada acrescenta exatamente um
      `MatchEvent` do tipo certo a `state.events`; `convocadoIds`/`titularIds`
      resultantes batem com a derivação de T003; `toggleTitular` continua bloqueado
      quando `state.started` (comportamento já existente, não pode regredir);
      `toggleConvocado` funciona tanto com `state.started === false` quanto `true`
      (nunca teve essa guarda — não pode ganhar uma por engano).

### Implementation for Foundational

- [ ] T005 Implementar `deriveConvocadoIds(events: MatchEvent[]): string[]` e
      `deriveTitularIds(events: MatchEvent[]): string[]` em
      `packages/engine/src/liveMatch.ts` (depende de T002; T003 deve falhar antes,
      passar depois). Nomes distintos da função já existente
      `titularIdsFromEvents` (que deriva do `lineup` do `kickoff`, uso diferente,
      ver research.md Decisão 7/data-model.md) — não confundir nem reaproveitar uma
      pela outra.
- [ ] T006 Mudar a assinatura de `toggleConvocado`/`toggleTitular` em
      `packages/engine/src/liveMatch.ts` para `(state, playerId, nowMs)`: cada
      chamada cria o `MatchEvent` certo via `createEvent` (já existe em
      `events.ts`) com `ms=0, period=1` quando `!state.started` (sem relógio ainda)
      ou `matchElapsedMs(state, nowMs)`/`state.period` quando já em jogo (US2),
      acrescenta a `state.events`, e recalcula `convocadoIds`/`titularIds` via T005
      (depende de T005; T004 deve falhar antes, passar depois). `toggleTitular`
      mantém a guarda `if (state.started) return state` exatamente como hoje.
- [ ] T007 Em `apps/web/src/match/useLiveMatch.ts`: (a) atualizar as chamadas de
      `toggleConvocado`/`toggleTitular` pra passar `now()` como `nowMs` (nova
      assinatura de T006); (b) fazer os eventos novos resultantes entrarem na fila
      de sincronização (`enqueue`, mesma lógica já usada dentro de `apply()`) SEM
      entrar na pilha de undo — extrair a parte de "enfileirar eventos novos" de
      `apply()` pra uma função auxiliar partilhada, reaproveitada tanto por
      `apply()` (com undo) quanto por um novo wrapper só pra estas duas ações (sem
      undo) — preserva o comentário/intenção já existente no ficheiro ("ficam fora
      da pilha de undo — são ajustes de pré-jogo"). Depende de T006.

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

- [ ] T008 [US1] Novo efeito em `apps/web/src/match/useLiveMatch.ts`, ativo só
      enquanto `!state.started`: a cada ~10s, busca em `match_events` (Supabase) os
      eventos `convocado_add`/`convocado_remove`/`titular_add`/`titular_remove`
      deste `matchId` cujo `client_event_id` ainda não está em `state.events`,
      acrescenta-os ao estado local, e recalcula `convocadoIds`/`titularIds` via
      T005 — nunca reenfileira estes eventos de volta (já vieram do servidor).
      Mesmo padrão de poll leve e só-leitura já usado por `useLiveMatchPoint.ts`
      (specs/006-live-rotation-replan/). Depende de T005, T007.
- [ ] T009 [US1] Verificação manual: Cenário 1 e Cenário 4 de `quickstart.md`.

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
