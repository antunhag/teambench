# Tasks: Motor de Sugestão de Rotação Baseado em Dados

**Input**: Design documents from `/specs/003-data-driven-rotation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: Incluídos só pra `packages/engine` (lógica pura) — `apps/web` não tem
infraestrutura de testes automatizados hoje (gap já registado no roadmap), então a
validação das User Stories é manual, via `quickstart.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (ficheiros diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A que User Story da spec esta tarefa pertence (US1–US3)

---

## Phase 1: Setup

- [X] T001 Confirmar baseline verde antes de começar: `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`, `npm run build --workspace apps/web` (110/110 testes, typecheck e build limpos)

---

## Phase 2: Foundational

- [X] T002 Escrever `supabase/migrations/0021_player_availability.sql`: 2 colunas novas em `players` — `availability_status` (`text not null default 'apto'`, `check (... in ('apto', 'a_retomar', 'indisponivel'))`) e `availability_note` (`text`, nullable). Sem policy nova — já cobertas por `players_update_coach` (migração 0004). Sem gate do `security-auditor` (Princípio II não exige — ver Constitution Check em `plan.md`)
- [X] T003 Aplicar a migração 0021 no SQL Editor do Supabase (ação do utilizador) — depende de T002

**Checkpoint**: Fundação pronta — as colunas existem, User Stories 1 e 2 podem começar.

---

## Phase 3: User Story 2 - Registar o estado do atleta (Priority: P1)

**Goal**: Dar ao treinador um lugar, no Plantel, pra marcar Apto/A retomar/Indisponível — pré-requisito de dados da User Story 1 (a spec já diz isto explicitamente), por isso implementada primeiro apesar de ambas serem P1.

**Independent Test**: Cenário 2 do [quickstart.md](quickstart.md).

- [X] T004 [P] [US2] Em `apps/web/src/team/usePlayers.ts`: expor `availabilityStatus`/`availabilityNote` de cada atleta (já vêm da mesma query) e uma função `setAvailability(playerId, status, note)` (`update` direto em `players`, mesma policy já existente) — depende de T003
- [X] T005 [US2] Em `apps/web/src/team/Roster.tsx`: campo de estado por atleta (3 opções — Apto/A retomar/Indisponível — mais um campo de motivo opcional quando não-Apto), reaproveitando o padrão de edição inline já existente na tela — depende de T004
- [X] T006 [US2] Em `apps/web/src/match/useRotationPlan.ts`: depois de `saveStints` guardar com sucesso, para cada atleta incluído no plano cujo estado seja `a_retomar`, chamar `setAvailability(playerId, 'apto', null)` (Decisão 1 do `research.md` — expira sozinho ao ser usado, nunca por data) — depende de T004
- [X] T007 [US2] Validar manualmente com o Cenário 2 do `quickstart.md` — depende de T005, T006

**Checkpoint**: User Story 2 completa e testável sozinha — o estado já pode ser marcado e persiste/expira corretamente, mesmo sem a sugestão da User Story 1 ainda existir.

---

## Phase 4: User Story 1 - Sugestão de escalação por vaga (Priority: P1)

**Goal**: Ordenar o seletor de atleta do planeador por aptidão + estado, com minutos recentes como contexto (nunca fator de ordenação, ver FR-006).

**Independent Test**: Cenário 1 do [quickstart.md](quickstart.md).

- [X] T008 [P] [US1] Criar `packages/engine/src/recentMinutes.ts`: `aggregateRecentMinutes(matches: {events, format}[], ...)` — pura, reaproveita `replayEvents` já existente, soma `clockAcc.onCourtSince` através de vários jogos, devolve `{playerId, totalMs, gamesCounted}[]` (ver `data-model.md`, entidade `RecentMinutes`) — depende de nada
- [X] T009 [P] [US1] Testes em `packages/engine/test/recentMinutes.test.ts`: agregação correta através de 2+ jogos, atleta que não jogou nenhum (gamesCounted=0), atleta convocado mas sem minutos num jogo específico — depende de T008
- [X] T010 [P] [US1] Criar `packages/engine/src/rotationSuggestion.ts`: `suggestOrder(players, aptitudesBySlot, availabilityByPlayer, recentMinutesByPlayer, slot)` — pura, devolve a lista ordenada (`RotationSuggestion[]`, ver `data-model.md`) por vaga: `indisponivel` sempre por último (FR-002), depois por `quality` (A > B > C > sem classificação, FR-005/FR-006 — minutos NUNCA entram na ordenação, só no campo `reason` computado); inclui também `explainSuggestion`, frase curta em português combinando aptidão + estado + contexto de minutos (usado só a partir da User Story 3, mas computado aqui pra não duplicar a lógica depois) — depende de nada
- [X] T011 [P] [US1] Testes em `packages/engine/test/rotationSuggestion.test.ts`: ordenação correta (indisponível por último, A/B/C/sem-classificação), atleta sem histórico ordenado só pela aptidão (FR-006) — depende de T010
- [X] T012 [US1] Criar `apps/web/src/match/useRecentMinutes.ts`: busca os 5 jogos mais recentes com `status = 'finished'` desta equipa + os respetivos `match_events`, chama `engine.aggregateRecentMinutes` (Decisão 2/3 do `research.md`) — depende de T008
- [X] T013 [US1] Em `apps/web/src/match/RotationPlanner.tsx`: trocar a lista plana dos `<select>` de atleta pela ordem de `engine.suggestOrder`, com uma indicação visual simples pra `a_retomar`/`indisponivel` (ex.: um símbolo no texto da opção — `<option>` não suporta HTML rico) — depende de T010, T012, T004
- [X] T014 [US1] Validar manualmente com o Cenário 1 do `quickstart.md` — depende de T013

**Checkpoint**: User Stories 1 e 2 completas — escopo mínimo viável (MVP), já que as duas são P1.

---

## Phase 5: User Story 3 - Ver o motivo da sugestão (Priority: P2)

**Goal**: Mostrar, por extenso, a frase já computada em `suggestOrder` (User Story 1) — sem lógica nova no motor, só exposição na UI.

**Independent Test**: Cenário 3 do [quickstart.md](quickstart.md).

- [X] T015 [P] [US3] Reforçar `packages/engine/test/rotationSuggestion.test.ts` com casos específicos do conteúdo de `reason`: só aptidão, aptidão + "a retomar", aptidão + contexto de minutos, atleta sem classificação — depende de T010
- [X] T016 [US3] Em `apps/web/src/match/RotationPlanner.tsx`: mostrar o `reason` de cada atleta por extenso junto da opção sugerida (ex.: texto de apoio abaixo do `<select>`, atualizado conforme a seleção) — depende de T013
- [X] T017 [US3] Validar manualmente com o Cenário 3 do `quickstart.md`, incluindo o caso de um atleta recém-chegado sem jogos anteriores — depende de T016

**Checkpoint**: As três User Stories completas e testáveis — spec `003-data-driven-rotation` pronta pro Polish.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] Atualizar `docs/ARCHITECTURE.md` (seção "Planeamento de rotação e aptidão") com estado do atleta + agregação de minutos recentes — Princípio VI da constituição, gate obrigatório antes do push
- [X] T019 Atualizar `docs/ROADMAP.md`: marcar "Motor de Sugestão de Rotação Baseado em Dados" como feito
- [X] T020 Rodar a secção "Regressão a conferir" do `quickstart.md` (planeador manual continua a funcionar sem a sugestão, Resumo/Timeline de um jogo continua correto, suite Vitest completa) antes do commit final

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende do Setup — bloqueia as User Stories 1 e 2 (ambas leem/escrevem as colunas novas).
- **User Story 2 (Fase 3)**: depende só da Fundação. Implementada ANTES da User Story 1 nesta lista apesar de ambas serem P1 — a própria spec diz que US1 depende dos dados que US2 introduz (estado do atleta), não tem valor demonstrável sem isso existir primeiro.
- **User Story 1 (Fase 4)**: depende da Fundação (T003) e de T004 (função de leitura/escrita de estado, de US2) — a lógica pura (T008-T011) pode começar em paralelo com a Fase 3, só a integração em `RotationPlanner.tsx` (T013) precisa esperar.
- **User Story 3 (Fase 5)**: depende de T010/T013 (US1) — é só exposição na UI de algo que US1 já computa, não lógica nova no motor.
- **Polish (Fase 6)**: depende de todas as User Stories desejadas estarem entregues.

### Parallel Opportunities

- T008-T011 (lógica pura de US1, `packages/engine`) podem começar em paralelo com toda a Fase 3 (US2) — só T012/T013 (integração em `apps/web`) dependem de T004 (de US2).
- Dentro da User Story 1: T008/T010 em paralelo entre si (ficheiros diferentes); T009 depende de T008, T011 depende de T010.
- Dentro da Fundação: só uma tarefa real (T002), sem paralelismo a ganhar.

---

## Parallel Example: Início da feature

```bash
# Em paralelo, assim que a Fundação (T002/T003) terminar:
Task: "Criar packages/engine/src/recentMinutes.ts"
Task: "Criar packages/engine/src/rotationSuggestion.ts"
Task: "Em apps/web/src/team/usePlayers.ts: expor availabilityStatus/setAvailability"
```

---

## Implementation Strategy

### MVP First (User Stories 2 + 1 — as duas P1)

1. Completar a Fase 1 (Setup) e a Fase 2 (Fundação — migração aplicada).
2. Completar a Fase 3 (User Story 2) — o estado já pode ser marcado no Plantel.
3. Completar a Fase 4 (User Story 1) — a sugestão já ordena por aptidão + estado.
4. **PARAR E VALIDAR**: rodar os Cenários 1 e 2 do `quickstart.md` antes de seguir.
5. Nesse ponto já há um MVP completo — as duas prioridades P1 entregues.

### Entrega Incremental

1. Setup → Fundação → User Story 2 → validar → o Plantel já ganha o estado do atleta, mesmo sem a sugestão ainda usar isso visivelmente.
2. User Story 1 → validar → MVP completo (sugestão funcionando).
3. User Story 3 → validar → motivo visível, maior confiança na sugestão.
4. Polish — documentação viva (Princípio VI) antes do commit/push final e do merge pra `main`.

---

## Notes

- Nenhuma tarefa aqui precisa do `security-auditor` (Princípio II) — sem RLS nova, a migração só adiciona colunas sob uma policy já existente.
- Nenhuma tarefa testa contra o Plantel ou jogos reais do clube — sempre dados de teste (Princípio IV).
- Trabalho feito na branch `003-data-driven-rotation` — só vai para `main`/produção quando o dono do produto confirmar o merge, não a cada commit (ver conversa que motivou a branch).
- `docs/ARCHITECTURE.md` só é atualizado no fim (Fase 6), mas o gate da constituição exige que isso aconteça ANTES do push final, não depois.
