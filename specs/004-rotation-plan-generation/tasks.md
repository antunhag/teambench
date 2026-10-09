# Tasks: Geração automática de plano de rotação completo

**Input**: Design documents from `/specs/004-rotation-plan-generation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: Incluídos só pra `packages/engine` (lógica pura) — `apps/web` não tem
infraestrutura de testes automatizados hoje, então a validação das User Stories é
manual, via `quickstart.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (ficheiros diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A que User Story da spec esta tarefa pertence (US1–US4)

---

## Phase 1: Setup

- [X] T001 Confirmar baseline verde antes de começar: `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`, `npm run build --workspace apps/web`

---

## Phase 2: Foundational

- [X] T002 Escrever `supabase/migrations/0022_rotation_plan_weights.sql`: tabela `rotation_plan_weights` (`match_id`, `team_id` denormalizado, `player_id`, `slot_type`, `weight` 1-5, `unique (match_id, player_id, slot_type)`) + RLS (select por equipa, insert/update/delete só `team_admin`) — mesmo padrão de `rotation_plan_stints` (migração 0012, ver `data-model.md`)
- [X] T003 **Invocar o subagente `security-auditor`** pra revisar a migração 0022 — Princípio II da constituição exige isso aqui (tabela nova + RLS nova, diferente da feature 003 que não precisou). Corrigir qualquer achado antes de seguir — depende de T002
- [ ] T004 Aplicar a migração 0022 no SQL Editor do Supabase (ação do utilizador) — só depois da revisão em T003 estar aprovada, nunca antes — depende de T003

**Checkpoint**: Fundação pronta — a tabela existe e foi revisada, User Stories podem começar.

---

## Phase 3: User Story 1 - Ajustar o peso de cada atleta por vaga (Priority: P1)

**Goal**: Dar ao treinador um jeito de ajustar, pra um jogo específico, quanto confia em cada atleta por vaga — ponto de partida derivado da aptidão/estado, nunca escrevendo de volta no Plantel.

**Independent Test**: Cenário 1 do [quickstart.md](quickstart.md).

- [X] T005 [P] [US1] Criar `packages/engine/src/rotationWeights.ts`: `defaultWeight(quality: AptitudeQuality | null, availabilityStatus: AvailabilityStatus): number` — pura, devolve 1-5 combinando aptidão (A=5, B=3, C=1, sem classificação=1) e estado (a_retomar reduz pela metade, arredondado pra baixo, mínimo 1 — ver Decisão 3 do `research.md`) — depende de nada
- [X] T006 [P] [US1] Testes em `packages/engine/test/rotationWeights.test.ts`: cada combinação de aptidão × estado, confirma que a_retomar nunca derruba o peso abaixo de 1 — depende de T005
- [ ] T007 [US1] Criar `apps/web/src/match/useRotationWeights.ts`: `refresh()` lê `rotation_plan_weights` do jogo; `setWeight(playerId, slot, weight)` faz upsert (`onConflict: "match_id,player_id,slot_type"`); `byPlayerSlot` devolve o peso salvo ou, se ainda não ajustado, `engine.defaultWeight(...)` pra cada atleta incluído × 4 vagas — depende de T004, T005
- [ ] T008 [US1] Em `apps/web/src/match/RotationPlanner.tsx`: UI de ajuste de peso — por atleta incluído, um stepper de 1 a 5 (rotulado "pouca confiança" → "muita confiança") por vaga, incluindo vagas fora da aptidão cadastrada do atleta (caso do exemplo Ala Esquerda-A/Fixo-B da spec) — depende de T007
- [ ] T009 [US1] Validar manualmente com o Cenário 1 do `quickstart.md` — depende de T008

**Checkpoint**: User Story 1 completa e testável sozinha — pesos ajustáveis e persistidos, mesmo sem a geração ainda existir.

---

## Phase 4: User Story 2 - Gerar 3 opções de plano completo (Priority: P1)

**Goal**: A partir dos pesos (ajustados ou padrão), gerar 3 planos completos válidos, cada um com uma "personalidade" de rotação diferente, e deixar o treinador escolher um.

**Independent Test**: Cenário 2 do [quickstart.md](quickstart.md).

- [X] T010 [P] [US2] Criar `packages/engine/src/rotationGenerator.ts`: `generateRotationOptions(players, weightsBySlot, availabilityByPlayer, format): RotationPlanOption[]` — pura. Resolve 1 vaga por atleta (maior peso ajustado, empate por `suggestOrder` — Decisão 5); distribui o tempo de cada vaga/parte proporcional ao peso dos atletas elegíveis; gera 3 variações (turnos longos / equilibrada / mais rotativa — Decisão 4) que mantêm o tempo total por atleta próximo entre si, variando o número de turnos — depende de nada
- [X] T011 [P] [US2] Testes em `packages/engine/test/rotationGenerator.test.ts`: as 3 opções preenchem todas as vagas/partes sem buraco nem sobreposição; indisponível nunca aparece; atleta com peso em 2 vagas aparece só numa; tempo total por atleta não varia significativamente entre as 3 opções; vaga sem nenhum atleta com peso ainda é preenchida (fallback) — depende de T010
- [ ] T012 [US2] Em `apps/web/src/match/RotationPlanner.tsx`: botão "Gerar opções" (usa `useRotationWeights`), mostra as 3 opções nomeadas com resumo de minutos por atleta; escolher uma chama `saveStints` já existente com os turnos dela — depende de T007, T010
- [ ] T013 [US2] Validar manualmente com o Cenário 2 do `quickstart.md` — depende de T012

**Checkpoint**: User Stories 1 e 2 completas — MVP (ajustar pesos, gerar, escolher um plano).

---

## Phase 5: User Story 3 - Ajustar livremente o plano escolhido (Priority: P1)

**Goal**: Confirmar que um plano escolhido se comporta exatamente como um plano montado à mão — sem nenhuma restrição extra.

**Independent Test**: Cenário 3 do [quickstart.md](quickstart.md).

- [ ] T014 [US3] Confirmar que trocar atleta, mover fim de turno, remover e adicionar turno funcionam sobre os turnos de uma opção escolhida sem nenhuma mudança de código adicional (já esperado — a opção escolhida vira `rotation_plan_stints` normal via `saveStints`); corrigir se algo quebrar — depende de T012
- [ ] T015 [US3] Validar manualmente com o Cenário 3 do `quickstart.md` — depende de T014

**Checkpoint**: User Stories 1, 2 e 3 completas e testáveis.

---

## Phase 6: User Story 4 - Gerar novas opções quando os pesos/dados mudam (Priority: P2)

**Goal**: Permitir gerar de novo sem perder trabalho sem querer — sempre com confirmação explícita antes de substituir.

**Independent Test**: Cenário 4 do [quickstart.md](quickstart.md).

- [ ] T016 [US4] Em `apps/web/src/match/RotationPlanner.tsx`: ao acionar "Gerar opções" quando já existe um plano salvo (escolhido antes e/ou editado), mostrar aviso explícito pedindo confirmação antes de prosseguir pra tela das 3 novas opções — depende de T012
- [ ] T017 [US4] Validar manualmente com o Cenário 4 do `quickstart.md` — depende de T016

**Checkpoint**: As quatro User Stories completas e testáveis — spec `004-rotation-plan-generation` pronta pro Polish.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Atualizar `docs/ARCHITECTURE.md` (seção "Planeamento de rotação e aptidão") com o conceito de peso por jogo/vaga e o motor de geração — Princípio VI da constituição, gate obrigatório antes do push
- [ ] T019 Atualizar `docs/ROADMAP.md`: marcar "Geração automática de plano de rotação completo" como feito; atualizar a nota do item "Prioridade de uso / desembate na rotação" (R02) — esta feature resolve isso pelo conceito de peso, não mais um desembate binário
- [ ] T020 Rodar a secção "Regressão a conferir" do `quickstart.md` (planeador manual continua a funcionar sem a geração, sugestão da feature 003 continua intacta, suite Vitest completa) antes do commit final

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: depende do Setup — bloqueia todas as User Stories (todas leem/escrevem a tabela nova). Inclui o gate do `security-auditor` (T003), que não existia na feature anterior.
- **User Story 1 (Fase 3)**: depende da Fundação (T004) — é pré-requisito de dados pra User Story 2, por isso implementada primeiro apesar de ambas serem P1 (mesmo raciocínio da feature 003 com estado do atleta).
- **User Story 2 (Fase 4)**: depende da Fundação e de T007 (leitura/escrita de pesos, de US1) — a lógica pura do gerador (T010-T011) pode começar em paralelo com a Fase 3, só a integração em `RotationPlanner.tsx` (T012) precisa esperar.
- **User Story 3 (Fase 5)**: depende de T012 (US2) — é confirmação/ajuste fino sobre algo que US2 já entrega, não lógica nova.
- **User Story 4 (Fase 6)**: depende de T012 (US2) — acrescenta só o aviso de confirmação sobre o fluxo de geração já existente.
- **Polish (Fase 7)**: depende de todas as User Stories desejadas estarem entregues.

### Parallel Opportunities

- T005/T010 (lógica pura, `packages/engine`) podem começar em paralelo entre si e com T002/T003 (migração) — só T007/T012 (integração em `apps/web`) dependem da migração aplicada (T004).
- T006 depende de T005; T011 depende de T010.
- Dentro da Fundação: T002 e T003 são sequenciais (revisão depende da migração escrita); T004 é ação do utilizador, depende da revisão aprovada.

---

## Parallel Example: Início da feature

```bash
# Em paralelo, assim que a migração estiver escrita (T002), enquanto aguarda revisão/aplicação:
Task: "Criar packages/engine/src/rotationWeights.ts"
Task: "Criar packages/engine/src/rotationGenerator.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3 — as três P1)

1. Completar a Fase 1 (Setup) e a Fase 2 (Fundação — migração revisada pelo `security-auditor` e aplicada).
2. Completar a Fase 3 (User Story 1) — pesos já ajustáveis.
3. Completar a Fase 4 (User Story 2) — geração das 3 opções funcionando.
4. Completar a Fase 5 (User Story 3) — confirmar edição livre.
5. **PARAR E VALIDAR**: rodar os Cenários 1, 2 e 3 do `quickstart.md` antes de seguir.
6. Nesse ponto já há um MVP completo.

### Entrega Incremental

1. Setup → Fundação (com revisão de segurança) → User Story 1 → validar.
2. User Story 2 → validar → MVP completo (gerar e escolher).
3. User Story 3 → validar → confiança de que editar depois funciona sem restrição.
4. User Story 4 → validar → regenerar com segurança.
5. Polish — documentação viva (Princípio VI) antes do commit/push final e do merge pra `main`.

---

## Notes

- **Diferente da feature anterior**: esta EXIGE revisão do `security-auditor` (Princípio II) antes de aplicar a migração — tabela nova com RLS nova, não colunas sob uma policy já existente.
- Nenhuma tarefa testa contra o Plantel ou jogos reais do clube — sempre dados de teste (Princípio IV).
- Trabalho feito na branch `004-rotation-plan-generation` — só vai para `main`/produção quando o dono do produto confirmar o merge.
- `docs/ARCHITECTURE.md` só é atualizado no fim (Fase 7), mas o gate da constituição exige que isso aconteça ANTES do push final, não depois.
