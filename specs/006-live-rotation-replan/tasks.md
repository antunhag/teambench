---

description: "Task list for Replaneamento de rotação durante o jogo"
---

# Tasks: Replaneamento de rotação durante o jogo

**Input**: Design documents from `/specs/006-live-rotation-replan/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md)

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

- [ ] T001 Confirmar branch `006-live-rotation-replan` criada/checked out. Nenhuma
      dependência nova, nenhuma configuração de build nova — `packages/engine` e
      `apps/web` continuam exatamente como estão.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipo e utilitário compartilhados por US1 e US2 — nenhuma das duas pode
ser implementada sem isto.

**⚠️ CRITICAL**: Nenhuma User Story começa antes desta fase.

- [ ] T002 Adicionar o tipo `RotationStartPoint` (`{ period: number; elapsedSec:
      number }`) em `packages/engine/src/rotationPlan.ts`, exportado (ver
      `data-model.md`).
- [ ] T003 [P] Adicionar função pura auxiliar em `packages/engine/src/rotationPlan.ts`
      que decide se um `RotationStint` é "futuro" em relação a um `RotationStartPoint`
      (`stint.period > startPoint.period`, ou `stint.period === startPoint.period` e
      `stint.startSec >= startPoint.elapsedSec`) — vai ser reaproveitada pela detecção
      (US1) e pela montagem do array final ao confirmar (US2).

**Checkpoint**: Tipo e utilitário prontos — US1 e US2 podem começar.

---

## Phase 3: User Story 1 - Saber que o plano ficou desatualizado (Priority: P1) 🎯 MVP

**Goal**: Assim que um atleta escalado em turnos futuros é marcado indisponível, o
treinador vê um aviso claro — sem precisar perceber sozinho, turno a turno.

**Independent Test**: Jogo de teste ao vivo, plano já escolhido, marcar um atleta
escalado num turno futuro como indisponível no Plantel, voltar pra aba Rotações e
confirmar que o aviso aparece identificando os turnos afetados; marcar um atleta que
só aparece em turnos já passados e confirmar que NÃO aparece aviso nenhum.

### Tests for User Story 1 ⚠️

> Escrever estes testes PRIMEIRO, confirmar que falham antes de implementar.

- [ ] T004 [P] [US1] Testes em `packages/engine/test/rotationPlan.test.ts` pra
      `stintsAfetadosPorIndisponibilidade`: devolve os stints futuros de um atleta
      indisponível, agrupados por atleta; devolve vazio quando o atleta só aparece em
      stints passados; devolve vazio quando o atleta indisponível não aparece em
      nenhum stint; cobre múltiplos atletas indisponíveis ao mesmo tempo.

### Implementation for User Story 1

- [ ] T005 [US1] Implementar `stintsAfetadosPorIndisponibilidade(stints,
      availabilityByPlayer, startPoint)` em `packages/engine/src/rotationPlan.ts`,
      usando o utilitário de T003 (depende de T002, T003; T004 deve falhar antes,
      passar depois).
- [ ] T006 [US1] Em `apps/web/src/match/RotationPlanner.tsx`, detectar quando o jogo
      está ao vivo (reaproveitar o status já exposto por `MatchHub.tsx`/
      `useLiveMatch.ts`) e calcular o `RotationStartPoint` atual via
      `matchElapsedMs`/`state.period` já existentes — nenhuma lógica de cronómetro
      nova.
- [ ] T007 [US1] Em `RotationPlanner.tsx`, chamar `stintsAfetadosPorIndisponibilidade`
      com os stints já carregados + `availabilityByPlayer` + o `RotationStartPoint` de
      T006, e mostrar um aviso claro (português simples, Princípio V) listando os
      turnos/vagas afetados quando não-vazio; nada é mostrado quando vazio.
- [ ] T008 [US1] Verificação manual: Cenário 1 de `quickstart.md`.

**Checkpoint**: User Story 1 funciona de forma independente — aviso aparece/some
corretamente, nada mais muda no plano.

---

## Phase 4: User Story 2 - Pedir o replaneamento (Priority: P1)

**Goal**: O treinador pede uma sugestão cobrindo só o tempo restante do jogo, sem o
atleta indisponível, sem nunca reabrir turnos já jogados.

**Independent Test**: Com o aviso da US1 na tela, acionar "Gerar opções de plano" e
confirmar que as 3 opções cobrem só [momento atual, fim do jogo], nunca escalam o
atleta indisponível, e que escolher uma delas preserva os turnos já jogados
intocados.

### Tests for User Story 2 ⚠️

> Escrever estes testes PRIMEIRO, confirmar que falham antes de implementar.

- [ ] T009 [P] [US2] Testes em `packages/engine/test/rotationGenerator.test.ts` pra
      `generateRotationOptions` com `startPoint` opcional: omitido → saída idêntica à
      de hoje (teste de regressão, nenhum `startPoint` nunca muda o comportamento já
      existente); com `startPoint` → nenhuma das 3 opções tem stint antes do ponto de
      início; cobertura exata de [startPoint, fim da parte/jogo]; atleta indisponível
      nunca aparece; teto de 5 min e domínio de peso (Decisões 6-8 de
      specs/004-rotation-plan-generation/research.md) continuam valendo dentro da
      janela restrita.

### Implementation for User Story 2

- [ ] T010 [US2] Modificar `scheduleWindowed` em
      `packages/engine/src/rotationGenerator.ts` pra aceitar um cursor inicial
      (`elapsedSec`) em vez de sempre começar em 0.
- [ ] T011 [US2] Modificar `generateRotationOptions` pra aceitar o `RotationStartPoint`
      opcional (depende de T002, T010): pula períodos antes de `startPoint.period`
      inteiramente, e começa o cursor em `startPoint.elapsedSec` só pro período de
      `startPoint.period` (T009 deve falhar antes, passar depois).
- [ ] T012 [US2] Em `RotationPlanner.tsx`, quando o jogo está ao vivo (reaproveitando
      a detecção de T006), passar o `RotationStartPoint` calculado pra
      `generateRotationOptions` ao clicar "Gerar opções de plano".
- [ ] T013 [US2] Em `RotationPlanner.tsx`, no "Escolher esta": montar o array final de
      stints = stints existentes com `period`/`startSec` antes do `RotationStartPoint`
      (copiados sem alteração, usando o utilitário de T003) + os stints da opção
      escolhida; chamar `saveStints` já existente com esse array, sem mudar a
      assinatura dela.
- [ ] T014 [US2] Verificação manual: Cenário 2 de `quickstart.md`.

**Checkpoint**: User Stories 1 e 2 funcionam juntas — aviso aparece, replaneamento é
gerado e aplicado corretamente, turnos passados nunca são tocados.

---

## Phase 5: User Story 3 - Confirmar antes de substituir (Priority: P2)

**Goal**: O treinador nunca tem uma sugestão aplicada sem ver antes exatamente o que
muda e confirmar explicitamente.

**Independent Test**: Gerar uma sugestão de replaneamento, conferir que ela mostra
claramente o que muda antes de qualquer confirmação; cancelar sem escolher e
confirmar que o plano original continua em vigor sem nenhuma mudança.

### Implementation for User Story 3

- [ ] T015 [US3] Em `RotationPlanner.tsx`, quando o jogo está ao vivo, deixar claro na
      UI de opções geradas que cada uma cobre só "a partir de agora" (não o jogo
      inteiro) — rótulo/texto diferenciado do fluxo pré-jogo, pra nunca confundir o
      treinador sobre o que está sendo substituído.
- [ ] T016 [US3] Conferir que cancelar/fechar sem escolher nenhuma opção nunca chama
      `saveStints` nem altera o plano em vigor (deve já ser verdade pelo fluxo
      existente reaproveitado — tarefa de verificação; só vira tarefa de código se a
      investigação encontrar um caminho que aplica sem confirmação).
- [ ] T017 [US3] Verificação manual: Cenário 3 de `quickstart.md`.

**Checkpoint**: As 3 User Stories funcionam de forma independente e em conjunto.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Garantias finais exigidas pela constituição antes de qualquer push —
nenhuma delas é código novo isolado de uma única User Story.

- [ ] T018 [P] Atualizar `docs/ARCHITECTURE.md` (Princípio VI) — documentar a nova
      capacidade de replaneamento ao vivo E, já que está sendo tocado, descrever
      também o aviso "turno encerra em breve" (`useLiveMatch.ts`) que já existia e
      nunca tinha sido documentado (achado durante a pesquisa desta feature, ver
      `plan.md`).
- [ ] T019 [P] Edge cases de `quickstart.md`: pouco tempo restante (últimos 2 min),
      vagas sem atletas suficientes pro tempo restante, edição manual de um turno
      entre o aviso e o replaneamento.
- [ ] T020 Rodar os Portões de Qualidade da constituição antes do push:
      `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`,
      `npm run build --workspace apps/web`.
- [ ] T021 Regressão: Cenário de regressão de `quickstart.md` — plano pré-jogo (jogo
      ainda não iniciado) continua gerando o jogo inteiro desde o minuto 0, igual a
      hoje; edição manual de turno continua funcionando; aviso "turno encerra em
      breve" continua funcionando sem alteração.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — T001 é só uma checagem.
- **Foundational (Phase 2)**: Depende do Setup. BLOQUEIA as 3 User Stories.
- **User Story 1 (Phase 3)**: Depende só do Foundational. Não depende de US2/US3.
- **User Story 2 (Phase 4)**: Depende só do Foundational. Reaproveita a detecção de
  "jogo ao vivo" de T006 (US1), mas gera/aplica a sugestão de forma independente —
  pode ser implementada e testada mesmo sem o aviso da US1 estar pronto (o treinador
  simplesmente acionaria o replaneamento sem ter visto um aviso primeiro).
- **User Story 3 (Phase 5)**: Depende de US2 já existir (não há o que confirmar antes
  de aplicar sem uma sugestão gerada) — é uma camada de garantia sobre o fluxo de US2,
  não uma capacidade isolada.
- **Polish (Phase 6)**: Depende de todas as User Stories desejadas estarem completas.

### Dentro de cada User Story

- Testes (quando incluídos) escritos e FALHANDO antes da implementação.
- T006 (detecção de "jogo ao vivo" + cálculo do `RotationStartPoint`) é implementada
  uma vez em US1 (T006) e reaproveitada por US2 (T012) — não duplicar.

### Parallel Opportunities

- T003 pode rodar em paralelo com T002 (mesmo ficheiro, mas funções independentes —
  cuidado com conflito de edição simultânea no mesmo ficheiro; execução sequencial
  seguindo a ordem numérica é mais segura aqui apesar da marcação [P]).
- T004 (testes US1) e T009 (testes US2) podem ser escritos em paralelo — ficheiros de
  teste diferentes, sem dependência entre si.
- T018 e T019 (Polish) podem rodar em paralelo entre si.

---

## Parallel Example: Foundational + testes

```bash
# T002 e T003 tocam o mesmo ficheiro (rotationPlan.ts) — fazer em sequência.
# T004 (rotationPlan.test.ts) e T009 (rotationGenerator.test.ts) são ficheiros
# diferentes e podem ser escritos em paralelo, uma vez que T002/T003 estejam prontos:
Task: "Testes para stintsAfetadosPorIndisponibilidade em packages/engine/test/rotationPlan.test.ts"
Task: "Testes para generateRotationOptions com startPoint em packages/engine/test/rotationGenerator.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 sozinha)

1. Completar Phase 1 (Setup) + Phase 2 (Foundational).
2. Completar Phase 3 (User Story 1) — só o aviso, sem geração nenhuma ainda.
3. **PARAR e VALIDAR**: Cenário 1 de `quickstart.md` funciona sozinho.
4. Isso já entrega valor real (o treinador para de seguir cegamente um plano
   desatualizado), mesmo antes do replaneamento em si existir.

### Entrega Incremental

1. Setup + Foundational → base pronta.
2. US1 → validar → já é uma melhoria real sozinha (aviso).
3. US2 → validar → entrega o valor completo (replaneamento de verdade).
4. US3 → validar → garantia extra de confiança sobre o que já funciona.
5. Polish (docs + portões de qualidade) → pronto pra push.

## Notes

- `[P]` = ficheiros diferentes, sem dependência.
- `[Story]` mapeia cada tarefa pra uma User Story específica, pra rastreabilidade.
- Nenhuma migração, nenhuma RLS nova — Constitution Check de `plan.md` já confirmou
  PASS sem pendência, então não há tarefa de revisão por subagente nesta lista
  (diferente de specs/004, que exigia `security-auditor` antes da migração).
- Commitar depois de cada tarefa ou grupo lógico, igual ao padrão já seguido nas
  features anteriores deste projeto.
