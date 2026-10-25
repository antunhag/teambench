---

description: "Task list for Captura detalhada de estatísticas"
---

# Tasks: Captura detalhada de estatísticas (segunda tela de jogo ao vivo)

> ⚠️ **Desatualizado (2026-10-25).** A `spec.md` foi revista com as decisões do piloto
> (ver secção *Clarifications* da spec). Estas tarefas ainda refletem a versão anterior
> (ex.: T001 "trabalho direto em `main`", fase de jogo, perdas/recuperações por jogador).
> Regenerar com `/speckit-plan` e `/speckit-tasks` antes de implementar.

**Input**: Design documents from `/specs/009-captura-detalhada/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: Incluídos — mesmo padrão já usado em todas as features anteriores deste
projeto (Vitest puro em `packages/engine/test/`, Princípio IV da constituição).

**Organization**: Tarefas agrupadas por User Story (spec.md), pra cada uma ser
implementável e testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (ficheiros diferentes, sem dependência entre si)
- **[Story]**: A qual User Story a tarefa pertence (US1/US2/US3/US4)

---

## Phase 1: Setup

**Purpose**: Nenhuma inicialização de projeto nova — feature inteira dentro do
monorepo já existente.

- [ ] T001 Confirmar trabalho direto em `main` (convenção já estabelecida do
      projeto). Nenhuma dependência nova em `package.json` de nenhum workspace —
      `packages/engine` continua zero deps; `apps/web` não precisa de nenhuma
      biblioteca nova (zona reaproveita `.zonegrid`/`.zbtn` já existente).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Os 10 tipos de evento e os 5 campos novos no modelo de dados, e o
esqueleto da tela nova (sem nenhuma ação ainda) — nenhuma User Story é possível
sem isto.

**⚠️ CRITICAL**: Nenhuma User Story começa antes desta fase.

- [ ] T002 Em `packages/engine/src/types.ts`: acrescentar os 10 valores novos a
      `EventType` (`remate`, `perda`, `recuperacao`, `transicao`, `defesa`,
      `saida`, `goleiro_linha_inicio`, `goleiro_linha_fim`, `fase_jogo`,
      `acao_defensiva`) e os 5 campos novos a `MatchEvent` (`desfecho`,
      `direcao`, `resultado`, `subtipo`, `fase` — ver data-model.md pros tipos
      exatos de cada um, incluindo `resultado: "ganha" | "perdida"`, nunca
      "ganho"/"perdido").
- [ ] T003 Em `apps/web/src/match/MatchHub.tsx`: nova aba ("Captura detalhada",
      ou nome equivalente), gated por `canTrackLive` — mesmo padrão já usado
      pelas 3 abas existentes (`showRegisto`/`showRotacoes`).
- [ ] T004 Novo ficheiro `apps/web/src/match/CapturaDetalhada.tsx`: esqueleto da
      tela — reaproveita `useLiveMatch(matchId, teamId, format, status)` (o
      MESMO hook que `MatchFlow`/`LiveMatch.tsx` já usam, sem nenhuma mudança
      nele), renderiza as duas zonas lado a lado (linhas por jogador à
      esquerda, painel de equipa à direita) com a lista de jogadores em quadra/
      banco vinda de `state.onCourt`/`state.convocadoIds` — sem nenhuma ação
      ligada ainda, só a estrutura visual.
- [ ] T005 [P] Em `apps/web/src/theme.css`: classes novas pro layout de duas
      zonas e linhas por jogador (clusters, rótulos verticais rotacionados —
      ver as decisões de UI consolidadas na spec). Reaproveita
      `.zonegrid`/`.zbtn` tal como já existem, sem alterá-las.

**Checkpoint**: A tela nova existe, mostra os jogadores em quadra organizados
em linhas e o painel de equipa vazio — nenhuma ação ainda funciona. Fundação
pronta pras User Stories.

---

## Phase 3: User Story 1 - O diretor regista o jogo inteiro sozinho (Priority: P1) 🎯 MVP

**Goal**: Apito, substituição, pausa, fim de parte/jogo, golo, cartão e falta
funcionam na tela nova, reaproveitando as funções de motor já existentes e
corretas — sem precisar de abrir "Jogo ao vivo".

**Independent Test**: quickstart.md Cenário 1.

### Implementation for User Story 1

> Nenhuma função nova em `packages/engine` nesta fase — `resumeOrStart`,
> `doSub`, `pause`/`endPause`, `endPeriod`, `doGoal`, `doCard`, `doFoul`,
> `doFoulSuffered` já existem e já estão corretas (research.md Decisão 5);
> só a UI que as invoca é nova.

- [ ] T006 [US1] Em `CapturaDetalhada.tsx`: escolha de titulares + apito
      inicial (estado "pré-apito" reaproveitando as linhas de jogador pra
      marcar titular/banco, botão de apito chamando `live.resumeOrStart()`).
- [ ] T007 [US1] Em `CapturaDetalhada.tsx`: gesto de substituição — tocar num
      jogador do banco (arma), tocar na linha de quem sai (confirma),
      chamando `live.doSub(outId, inId)`.
- [ ] T008 [US1] Em `CapturaDetalhada.tsx`: pausa (pedido de tempo com os 2
      lados + "outro motivo", mesmos `PAUSE_REASONS` já usados em
      `LiveMatch.tsx`) — iniciar/terminar chamando `live.pause()`/
      `live.endPause()`.
- [ ] T009 [US1] Em `CapturaDetalhada.tsx`: fim de parte e, quando for a
      última, fim de jogo — chamando `live.endPeriod()`.
- [ ] T010 [US1] Em `CapturaDetalhada.tsx`: clusters "Cartões" (amarelo/
      vermelho, empilhados) e "Falta" (feita/recebida, empilhados, sem zona
      ainda — ver US2) por linha de jogador, chamando `live.doCard()`/
      `live.doFoul()`/`live.doFoulSuffered()`; golo continua a abrir o mesmo
      sheet (marcador/tipo/zona/assistência) já usado em `LiveMatch.tsx`,
      com o jogador da linha já pré-selecionado como marcador.
- [ ] T011 [US1] Verificação manual: quickstart.md Cenário 1, contra um jogo
      de teste — apito ao fim do jogo só pela tela nova, confirmar que o
      Resumo fica idêntico ao que "Jogo ao vivo" produziria.

**Checkpoint**: User Story 1 funcional e testável de forma independente — um
jogo inteiro dá pra registar só pela tela nova.

---

## Phase 4: User Story 2 - Zona em remate/falta/defesa, sem perder velocidade (Priority: P2)

**Goal**: Remate (4 resultados), guarda-redes (defesas/saídas), e zona
opcional em remate/falta/falta sofrida/defesa.

**Independent Test**: quickstart.md Cenário 2.

### Tests for User Story 2 ⚠️

> Escrever estes testes PRIMEIRO, confirmar que falham antes de implementar.

- [ ] T012 [P] [US2] Testes em `packages/engine/test/liveMatch.test.ts` para
      `doRemate`/`doDefesa`/`doSaida`: cada um acrescenta exatamente um
      `MatchEvent` do tipo certo; nenhum dos três mexe em `onCourt`/
      `clockAcc`/`score` (research.md Decisão 6); `doRemate` nunca aceita
      `desfecho: "golo"` (isso continua a ser o evento `golo` já existente).

### Implementation for User Story 2

- [ ] T013 [US2] Em `packages/engine/src/liveMatch.ts`: `doRemate(state,
      playerId, desfecho, nowMs, zona?, tipo?)`, `doDefesa(state, playerId,
      nowMs, zona?)`, `doSaida(state, playerId, resultado, nowMs)` — mesmo
      padrão simples já usado por `doFoul`/`doFoulSuffered` (depende de
      T012; T012 deve falhar antes, passar depois).
- [ ] T014 [US2] Em `packages/engine/src/liveMatch.ts`: estender `doFoul`/
      `doFoulSuffered` pra aceitar `zona?` opcional (campo já existe em
      `MatchEvent`, só os dois construtores precisam de o passar adiante).
- [ ] T015 [US2] Em `CapturaDetalhada.tsx`: cluster "Remate" (4 resultados:
      Golo/Defendido/Fora/Bloqueado) por linha de jogador de linha, chamando
      `live.doGoal()` (golo) ou `live.doRemate()` (os outros 3); guarda-redes
      ganha "Defesas"/"Saídas" no lugar de "Remate" (FR-009 — nunca o
      cluster de Remate pro guarda-redes).
- [ ] T016 [US2] Em `CapturaDetalhada.tsx`: componente de seletor de zona
      reutilizável (grelha de 12 botões, mesmo `.zonegrid`/`.zbtn` já
      existente, nunca um desenho espacial do campo), aparecendo como passo
      opcional e saltável depois de remate/falta/falta sofrida/defesa —
      nunca bloqueia nem atrasa o registo do lance principal (FR-011).
- [ ] T017 [US2] Verificação manual: quickstart.md Cenário 2.

**Checkpoint**: User Stories 1 e 2 funcionam juntas — remate/zona capturados,
sem regressão na autossuficiência.

---

## Phase 5: User Story 3 - Painel de equipa, sem atrapalhar a marcação de remates (Priority: P3)

**Goal**: Fase de jogo, posse, transição (com vantagem numérica obrigatória),
bola parada, ações defensivas, goleiro-linha — e a derivação automática de
`tipo` pra remate/golo.

**Independent Test**: quickstart.md Cenário 3.

### Tests for User Story 3 ⚠️

- [ ] T018 [P] [US3] Testes em `packages/engine/test/liveMatch.test.ts` para
      `doPerda`/`doRecuperacao`/`doTransicao`/`doFaseJogo`/
      `doGoleiroLinhaInicio`/`doGoleiroLinhaFim`/`doAcaoDefensiva`: cada um
      acrescenta o evento certo; `doTransicao` nunca aceita `playerId`
      (FR-015); nenhum mexe em `onCourt`/`clockAcc`/`score`.
- [ ] T019 [P] [US3] Testes em `packages/engine/test/report.test.ts` para
      `inferirTipoOrigem(eventosAnteriores, faseAtiva)`: devolve `"trs"`
      quando o evento imediatamente anterior é uma `transicao` com
      `resultado="ganha"`; `"atr"` quando é uma `recuperacao`; `"org"`
      quando a fase ativa é `organizacao_ofensiva` e nada mais se aplica;
      `null` quando nada é dedutível (research.md Decisão 4).

### Implementation for User Story 3

- [ ] T020 [US3] Em `packages/engine/src/liveMatch.ts`: as 7 funções
      cobertas por T018 (depende de T018; deve falhar antes, passar
      depois).
- [ ] T021 [US3] Em `packages/engine/src/report.ts`: `inferirTipoOrigem`
      (depende de T019; deve falhar antes, passar depois).
- [ ] T022 [US3] Em `CapturaDetalhada.tsx`: painel de equipa — Fase de jogo
      (toggle gravado como evento), Posse (perda/recuperação), Transição
      (direção + resultado + vantagem numérica, os 3 obrigatórios pra
      confirmar — FR-014), Bola parada ganha/sofrida por tipo, Goleiro-linha
      (início/fim como período), Ações defensivas — todos com faixa opcional
      de atribuir a um jogador, EXCETO Transição (FR-015, nunca tem essa
      opção).
- [ ] T023 [US3] Em `CapturaDetalhada.tsx`: ligar `inferirTipoOrigem` ao
      confirmar um remate/golo — mostrar o `tipo` derivado de forma visível
      (ex. no toast de confirmação) e corrigível, nunca uma decisão
      silenciosa (FR-018); tipos de bola parada continuam sempre manuais.
- [ ] T024 [US3] Verificação manual: quickstart.md Cenário 3.

**Checkpoint**: As 3 primeiras User Stories funcionam juntas — a tela está
completa pra captura ao vivo.

---

## Phase 6: User Story 4 - Transições ofensivas desperdiçadas no Resumo (Priority: P4)

**Goal**: O treinador vê, depois do jogo, a lista de transições ofensivas
perdidas com vantagem numérica real.

**Independent Test**: quickstart.md Cenário 4.

### Tests for User Story 4 ⚠️

- [ ] T025 [P] [US4] Testes em `packages/engine/test/report.test.ts` para
      `transicoesDesperdicadas(events)`: só inclui `transicao` com
      `direcao="ofensiva"`, `resultado="perdida"`, e `transicaoNumeros` num
      preset de `TRANSICAO_NUMEROS_VANTAGEM` (nunca de
      `TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM`); transições "ganhas" ou
      com igualdade/desvantagem nunca aparecem (FR-020).

### Implementation for User Story 4

- [ ] T026 [US4] Em `packages/engine/src/report.ts`: `transicoesDesperdicadas`
      (depende de T025; deve falhar antes, passar depois).
- [ ] T027 [US4] Em `apps/web/src/match/MatchSummary.tsx`: nova secção
      "Transições desperdiçadas", chamando `transicoesDesperdicadas` sobre
      os eventos já carregados (reaproveita `mergeEvents`, já junta
      Supabase + local — nenhuma consulta nova ao Supabase).
- [ ] T028 [US4] Verificação manual: quickstart.md Cenário 4.

**Checkpoint**: As 4 User Stories funcionam juntas — a entrega completa.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Os 10 tipos novos aparecem no registo cronológico (texto),
Timeline (visual) e Registo (correção pós-jogo) — FR-021, a parte de
"exibição" que nenhuma User Story cobre sozinha.

- [ ] T029 [P] Em `packages/engine/src/report.ts`: `describeEvent` ganha um
      caso novo por tipo de evento (texto do registo cronológico), seguindo
      o padrão já estabelecido pelos tipos existentes.
- [ ] T030 [P] Em `packages/engine/src/timeline.ts`: `buildTimelineData`/
      `buildTimelineHtml` ganham marca/faixa pros tipos novos, mesmo padrão
      de lane já usado por golos/faltas/pausas/atendimento.
- [ ] T031 Em `apps/web/src/match/MatchEventEditor.tsx` (Registo): os 10
      tipos novos no dropdown "Tipo", com os pickers de detalhe
      correspondentes (zona, desfecho, direção/resultado/vantagem numérica,
      subtipo, fase) — mesmo padrão já usado pra pausa/atendimento.
- [ ] T032 [P] Atualizar `docs/ARCHITECTURE.md` (Princípio VI) — nova tela,
      novo bloco de `EventType`, o padrão de "evento informativo, sem efeito
      no motor" consolidado nesta feature.
- [ ] T033 Portões de Qualidade: `npm test --workspace packages/engine`,
      `npx tsc --noEmit -p apps/web`, `npm run build --workspace apps/web`.
- [ ] T034 Regressão: um jogo registado inteiramente pela tela ANTIGA ("Jogo
      ao vivo") continua a abrir e funcionar normalmente no Resumo/Timeline/
      Registo — os tipos de evento novos não quebram nada pra um jogo que
      nunca os usou; a tela "Jogo ao vivo" em si continua idêntica ao
      treinador.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências.
- **Foundational (Phase 2)**: Depende do Setup. BLOQUEIA as 4 User Stories.
- **User Story 1 (Phase 3)**: Depende só do Foundational — nenhuma função de
  motor nova, só UI reaproveitando o que já existe.
- **User Story 2 (Phase 4)**: Depende do Foundational. Pode ser implementada
  em paralelo com US1 por pessoas diferentes, mas faz mais sentido depois de
  US1 já ter o esqueleto de linhas de jogador funcionando (onde os clusters
  de Remate/Defesas/Saídas entram).
- **User Story 3 (Phase 5)**: Depende do Foundational. A derivação de `tipo`
  (T023) depende logicamente de US2 já existir (deriva o `tipo` de um
  remate/golo), mas as funções de motor (T020/T021) e o painel de equipa em
  si (T022) não dependem de US2.
- **User Story 4 (Phase 6)**: Depende de US3 (T020, `doTransicao`) já
  existir — não há transições pra filtrar sem isso.
- **Polish (Phase 7)**: Depende de todas as User Stories desejadas estarem
  completas (cada tipo de evento precisa de já existir antes de ganhar um
  caso em `describeEvent`/Timeline/Registo).

### Parallel Opportunities

- T004 e T005 (esqueleto da tela + CSS) podem ser feitas em paralelo.
- Testes de cada User Story (T012, T018+T019, T025) podem ser escritos em
  paralelo entre si, mas sequenciais dentro da própria User Story (testes
  antes da implementação correspondente).
- T029/T030/T032 (Polish) podem rodar em paralelo entre si.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: quickstart Cenário 1 — um jogo inteiro só pela tela
   nova, sem remate/painel de equipa ainda
5. Já é o suficiente pra validar que a tela autossuficiente funciona na
   prática, antes de investir nas camadas de captura mais densas

### Incremental Delivery

1. Setup + Foundational → tela existe, nenhuma ação funciona ainda
2. US1 → testar independente → diretor regista um jogo inteiro sozinho
3. US2 → testar independente → remate/zona capturados
4. US3 → testar independente → contexto tático capturado, sem perder
   velocidade no remate
5. US4 → testar independente → o alerta de coaching que motivou a vantagem
   numérica aparece no Resumo
6. Polish → tudo visível em Resumo/Timeline/Registo, não só capturado
7. Cada entrega soma valor sem quebrar a anterior
