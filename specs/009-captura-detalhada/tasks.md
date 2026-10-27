---

description: "Task list for Captura detalhada de estatísticas (Consola)"
---

# Tasks: Captura detalhada de estatísticas (segunda tela de jogo ao vivo — "Consola")

**Input**: Design documents from `/specs/009-captura-detalhada/` (revistos 2026-10-25)

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/consola-ui.md](./contracts/consola-ui.md), [quickstart.md](./quickstart.md)

**Referência de interação**: `docs/prototipos/consola-prototipo.html` (dados fictícios; guia de comportamento, não código a copiar).

**Tests**: incluídos só para lógica pura (Vitest, ambiente `node`, sem rede — Princípio IV): `apps/web/src/match/consola/*.test.ts` e `packages/engine/test/*.test.ts`. A UI é verificada manualmente pelo utilizador no aparelho (CLAUDE.md).

**Organization**: fases por etapa do plano; dentro de cada etapa, tarefas etiquetadas pela história que servem.

## Regras para todas as tarefas

- Trabalho **só** na branch `claude/fervent-fermi-q3zk57`; nunca commit/push direto em `main` (`main` = produção GitHub Pages).
- Cada comando (install, testes, typecheck, build) só corre com autorização explícita do utilizador (CLAUDE.md — "comando existente ≠ comando aprovado"). Commit local, push para a branch e merge para `main` são autorizações separadas.
- Nenhum teste ou automação contra um Supabase real, nem de leitura. Não ler `.env*`.
- `LiveMatch.tsx` não é alterado (FR-029). Item já enfileirado no `outbox` nunca é recalculado (invariante de `apps/web/src/sync/outbox.ts`, guarda 0026).
- O `npm test` da raiz cobre só engine + db-tests; os testes de `apps/web` correm com `npm test --workspace apps/web`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode correr em paralelo (ficheiros diferentes, sem dependências pendentes)
- **[Story]**: US1–US5 de `spec.md`

---

## Phase 1: Setup

**Purpose**: confirmar a base antes de tocar em código.

- [x] T001 Confirmar branch `claude/fervent-fermi-q3zk57` (`git status`, `git log -1`) e que a working tree só tem os artefactos de `specs/009-captura-detalhada/`; nunca fazer checkout de `main` para trabalhar
- [x] T002 Com autorização: correr a linha de base dos portões (`npm test`, `npm test --workspace apps/web`, `./node_modules/.bin/tsc -p packages/engine --noEmit`, `./node_modules/.bin/tsc -p packages/db-tests --noEmit`, `./node_modules/.bin/tsc -p apps/web --noEmit`, `npm run build --workspace apps/web`) e registar resultados antes de qualquer alteração, para distinguir falhas pré-existentes
- [x] T003 [P] Ler `apps/web/src/match/MatchHub.tsx`, `apps/web/src/match/MatchFlow.tsx`, `apps/web/src/match/useLiveMatch.ts` e `apps/web/src/match/LiveMatch.tsx` e anotar no topo de `apps/web/src/match/Consola.tsx` (comentário curto) que ações de `useLiveMatch` a Consola consome (apito, golo, golo sofrido, cartões, faltas, lesão, substituição, pausa, fim de parte, undo)

---

## Phase 2: Foundational — Etapa 1 (só `apps/web`, eventos existentes)

**Purpose**: esqueleto da Consola montado pelo mesmo `MatchFlow`/trava e lógica pura de layout e fluxos.

**⚠️ CRITICAL**: a US1 não começa sem esta fase.

- [x] T004 [P] Criar `apps/web/src/match/consola/layout.ts`: função pura que, dado `{width, height}` do viewport efetivo, devolve o modo (`iphone-v` | `iphone-h` | `tablet-v` | `tablet-h`) e o tamanho de botão candidato 64 → 56 → 48 px, nunca abaixo de 48 (FR-022, FR-023; research Decisão 6)
- [x] T005 [P] Criar `apps/web/src/match/consola/layout.test.ts` cobrindo as medidas de referência: iPhone 16 vertical (393×852) e horizontal, Galaxy Tab A11+ 800×1106 e 1280×626; afirmar que o tamanho nunca é < 48
- [x] T006 [P] Criar `apps/web/src/match/consola/flows.ts`: máquina de estados pura com estado único `fluxo: null | {kind:'pick-out', inId} | {kind:'pick-in', outId} | {kind:'vacancy', slot, inId}`; transições `start*`, `cancel` (volta a `null` sem efeito) e `complete` (devolve a substituição a registar) distintas (FR-002; research Decisão 7)
- [x] T007 [P] Criar `apps/web/src/match/consola/flows.test.ts`: cancelar a meio e depois tocar no banco começa um fluxo novo sem consumir a intenção antiga (US1 cenário 6); vaga exige escolha + confirmação; quem entra herda a posição de quem sai
- [x] T008 Em `apps/web/src/match/MatchFlow.tsx`, aceitar uma prop de variante (ex. `view: 'live' | 'consola'`, defeito `'live'`) que renderiza `Consola` em vez de `LiveMatch` com a mesma trava `useMatchLock` e o mesmo `useLiveMatch`; o caminho `'live'` fica byte-a-byte equivalente em comportamento (FR-029; research Decisão 2)
- [x] T009 Em `apps/web/src/match/MatchHub.tsx`, acrescentar a aba "Consola" visível com a mesma condição `canTrackLive` da aba de registo ao vivo, montando `MatchFlow` com `view='consola'`; a aba existente fica inalterada (FR-029)
- [x] T010 Criar `apps/web/src/match/Consola.tsx` com a estrutura do contrato (cabeçalho, barra de equipa, faixa do último evento, 5 linhas, banco/coluna lateral, doca no iPhone vertical) a usar `layout.ts`; relógio atualiza só o texto, sem re-render da lista (contracts/consola-ui.md "Estrutura")
- [x] T011 [P] Acrescentar em `apps/web/src/theme.css` as classes da Consola (prefixo `.consola-`): alvos ≥ 48×48 até 64 px, sem hover, safe areas (`env(safe-area-inset-*)`), hifenização com `hyphens: manual` + `&shy;` em rótulos longos, sem scroll horizontal; sem alterar classes usadas por `LiveMatch.tsx`

**Checkpoint**: aba "Consola" aparece para quem pode registar, com a trava normal; testes de `layout`/`flows` passam.

---

## Phase 3: User Story 1 — Registar o jogo inteiro só pela Consola (Priority: P1) 🎯 MVP — Etapa 1

**Goal**: o diretor regista apito a apito (titulares, golos, golo sofrido, cartões, faltas, atendimento, substituições, vaga, pausas, fim/início de parte) só com a Consola, no iPhone e no tablet.

**Independent Test**: quickstart.md "Etapa 1" passos 1–9; o Resumo do jogo e a Timeline ficam idênticos ao que o "Jogo ao vivo" produziria (SC-001, SC-002).

- [x] T012 [P] [US1] Criar `apps/web/src/match/consola/ConsolaRow.tsx` (densidade B): jogador de linha com Golo · Falta feita · Falta recebida e ⋯ (Amarelo, Vermelho, Atendimento, Substituir); "Remate ▸" fica escondido até à Etapa 2; linha do GR com Golo sofrido · Falta feita · Falta recebida e ⋯; cada toque chama a ação existente de `useLiveMatch` com o `playerId` da linha (FR-006, FR-007)
- [x] T013 [US1] Golo na `ConsolaRow`: Golo → folha de confirmação com assistência, tipo e zona opcional (campos existentes `tipo`, `assistId`, `zona`); grelha desenhada com a referência do clube (nossa baliza à esquerda, colunas 1-3 | 4-6 ‖ 7-9 | 10-12, cada coluna de cima para baixo, meio-campo tracejado); 2 toques sem detalhes (SC-003) — em `apps/web/src/match/consola/ConsolaRow.tsx`
- [x] T014 [P] [US1] Criar `apps/web/src/match/consola/TeamBar.tsx` com o que já existe: Golo sofrido (com tipo/zona opcionais, evento `golo_sofrido`), Pausa/Retomar (pedido de tempo vs. outro motivo), Iniciar parte, Fim da parte; contador "1ª n · total m" para golo sofrido; layout tablet vs. iPhone ("Mais…" no iPhone) conforme contrato (FR-003, FR-004, FR-012, FR-026)
- [x] T015 [US1] Substituições em `apps/web/src/match/Consola.tsx` usando `flows.ts`: banco → jogador → "SAI" na linha; ⋯ → Substituir → banco; cancelar por botão/✕/fundo; quem entra herda a posição da linha (FR-002)
- [x] T016 [US1] Vaga por vermelho em `apps/web/src/match/Consola.tsx`: a linha fica vaga na mesma posição; reposição só com escolha no banco + confirmação e aviso "a elegibilidade da reposição não é validada"; regista `substituicao` com `outId: null`
- [x] T017 [US1] Faixa do último evento em `apps/web/src/match/Consola.tsx` (altura fixa): hora, ação, jogador, detalhes; "Desfazer" ligado a `undo()` de `useLiveMatch`, desativado em limites de parte e durante um fluxo; o relógio nunca recua (research Decisão 9)
- [x] T018 [US1] Apito e titulares em `apps/web/src/match/Consola.tsx`: escolher titulares e dar o apito de cada parte com as mesmas ações de motor do "Jogo ao vivo"; a parte seguinte só começa pelo botão; aviso da 5ª falta como hoje (FR-001, FR-004, FR-005)
- [x] T019 [P] [US1] Criar `apps/web/src/match/consola/SummarySheet.tsx`: Resumo rápido (parte atual vs. jogo) com os tipos existentes — golos, golos sofridos, faltas feitas/recebidas, cartões — acessível em 1 toque (doca no iPhone, faixa de cima no tablet) (FR-027)
- [x] T020 [US1] Banco e doca em `apps/web/src/match/Consola.tsx`: tablet com banco na coluna lateral visível sem scroll em 800×1106 e 1280×626; iPhone vertical com doca (Substituir, Resumo, Pausa, ⚙); iPhone horizontal com "Equipa" na coluna lateral; ⚙ permite densidade A/B (defeito B)
- [x] T021 [US1] Medição pós-render em `apps/web/src/match/Consola.tsx`: se os 5 jogadores não couberem sem scroll com o tamanho de `layout.ts`, descer 64 → 56 → 48 px (nunca abaixo) (FR-023, SC-005)

### Portões e verificação — Etapa 1

- [x] T022 [US1] Com autorização: `npm test`, `npm test --workspace apps/web`, `./node_modules/.bin/tsc -p apps/web --noEmit` (e engine/db-tests, que não devem mudar), `npm run build --workspace apps/web`; relatar comandos executados, resultados e o que não foi executado
- [x] T023 [US1] Confirmar por `git diff --stat` que a Etapa 1 só toca em `apps/web/` (+ docs), não em `packages/engine/`, `supabase/` nem `apps/web/src/match/LiveMatch.tsx`
- [x] T024 [P] [US1] Atualizar `docs/ARCHITECTURE.md` com a Consola (aba, `MatchFlow` variante, mesma trava, módulos puros `layout`/`flows`) — Princípio VI
- [ ] T025 [US1] Pedir ao utilizador a verificação manual de quickstart.md "Etapa 1" (iPhone vertical e tablet nas duas orientações, jogo de teste), incluindo SC-005; corrigir o que for reportado
- [ ] T026 [US1] Com autorizações separadas: commit local; push para `claude/fervent-fermi-q3zk57`; o merge para `main` (deploy) é decisão do utilizador

**Checkpoint**: MVP utilizável num jogo real a partir da branch, sem mudanças de motor nem de BD.

---

## Phase 4: Foundational — Etapa 2a (motor + anulação, sem UI)

**Purpose**: novos tipos de evento, ações de motor e projeção de eventos efetivos. Bloqueia as fases 5–8. Zero migrações (research Decisão 1).

- [x] T027 Em `packages/engine/src/types.ts`, acrescentar a `EventType`: `remate`, `remate_adv`, `defesa`, `saida`, `transicao`, `perda`, `recuperacao`, `goleiro_linha_inicio`, `goleiro_linha_fim`, `anulacao`; e os campos de payload do data-model: `desfecho` (`defendido` | `fora` | `bloqueado`; em `remate_adv` só `fora` | `bloqueado`), `resultado` (`ganha` | `perdida`), `dir` (`ofensiva` | `defensiva`), `zona3` (`defesa` | `meio` | `ataque`), `durSec`, `alvoId`
- [x] T028 Em `packages/engine/src/liveMatch.ts`, acrescentar `doRemate`, `doRemateAdv`, `doDefesa`, `doSaida`, `doTransicao`, `doPerda`, `doRecuperacao`, `doGoleiroLinhaInicio`, `doGoleiroLinhaFim`, `doAnulacao` e `zona?` opcional em falta, falta sofrida e cartões, com as validações do data-model: "`transicao`: `dir`, `resultado` e `transicaoNumeros` obrigatórios; `playerId` sempre null"; "`zona`: inteiro 1-12"; "`zona3`: só em `perda`/`recuperacao`"; `defesa`/`saida` atribuídas ao GR em campo; `remate_adv`, `perda`, `recuperacao` com `playerId` null
- [x] T029 Criar `packages/engine/src/annul.ts` com `eventosEfetivos(events)`: remove `anulacao` e os eventos por elas anulados; uma anulação de uma anulação reativa o original; validar que "`anulacao.alvoId` tem de referir um evento existente do mesmo jogo, de uma categoria de equipa (`transicao`, `golo_sofrido`, `remate_adv`, `defesa`, `perda`, `recuperacao`), ainda não anulado"; exportar em `packages/engine/src/index.ts`
- [x] T030 Criar em `packages/engine/src/annul.ts` `ultimoDaCategoria(events, categoria)` e `contarCategoria(events, categoria, period)` (parte atual · total) segundo a tabela "Categorias de equipa" do data-model
- [x] T031 Fazer `recomputeScoreFor` (e qualquer derivação de placar em `packages/engine/src/liveMatch.ts`/`report.ts`) usar `eventosEfetivos` — golo sofrido anulado deixa de contar
- [x] T032 Em `packages/engine/src/goalTypes.ts`, corrigir o comentário de `ZONAS_GOLO` para a grelha de referência (nossa baliza à esquerda; colunas 1-3 | 4-6 ‖ 7-9 | 10-12, cada uma de cima para baixo) sem mudar valores (research Decisão 5)
- [x] T033 [P] Testes em `packages/engine/test/liveMatch.test.ts` para cada `do*` novo (campos, `playerId`, validações e erros)
- [x] T034 [P] Criar `packages/engine/test/annul.test.ts`: anular o último de cada categoria, anulação dupla, alvo inexistente/de outra categoria rejeitado, contagens por parte, placar após "−" num golo sofrido
- [x] T035 Com autorização: `npm test --workspace packages/engine` e `./node_modules/.bin/tsc -p packages/engine --noEmit`; relatar resultados

**Checkpoint**: motor pronto; nenhuma UI mudou; eventos antigos produzem os mesmos resultados (testes existentes intactos).

---

## Phase 5: User Story 2 — Zona de qualquer lance sem perder velocidade (Priority: P2) — Etapa 2b

**Goal**: zona opcional (+1 toque) em remate, remate deles, defesa, saída, faltas e cartões, sem atrasar a ação seguinte e sem UPDATE de eventos já enviados.

**Independent Test**: quickstart.md "Etapa 2" passos 1 e 3 (ignorar o painel e tocar noutra ação regista ambas; fechar a app com o painel aberto e reabrir → evento sincroniza uma única vez).

- [x] T036 [P] [US2] Criar `apps/web/src/match/consola/deferredEnqueue.ts`: função pura "enfileirar agora?" dado `{zonaPendente, evento}` e o gatilho (`zona-escolhida` | `painel-fechado` | `outra-acao` | `prazo` (~10 s) | `desmontar` | `arranque`) (research Decisão 3)
- [x] T037 [P] [US2] Criar `apps/web/src/match/consola/deferredEnqueue.test.ts` cobrindo todos os gatilhos e que um evento nunca é enfileirado duas vezes
- [x] T038 [US2] Em `apps/web/src/match/useLiveMatch.ts`, implementar o envio adiado do último evento com zona pendente: entra logo no estado local (`localStorage`), só vai para o `outbox` (com a zona) no primeiro gatilho; no arranque/desmontar enfileira eventos locais ainda não enfileirados; o caminho do "Jogo ao vivo" mantém envio imediato (FR-028, FR-029)
- [x] T039 [P] [US2] Criar `apps/web/src/match/consola/ZonePanel.tsx`: painel não modal (sem fundo escurecido, não desloca a lista) com a grelha de referência; um toque grava a zona; ✕ ou outra ação fecha sem custo (FR-010, FR-011)
- [x] T040 [US2] Ligar `ZonePanel` em `apps/web/src/match/Consola.tsx` e "+ Zona" na faixa do último evento, para remate, remate deles, defesa, saída, faltas e cartões
- [x] T041 [US2] Pedir ao `code-reviewer` (só leitura; a sessão fornece o diff) revisão de `useLiveMatch.ts` + `deferredEnqueue.ts` por mexer na fila de sincronização (plan, Princípio II nota)

**Checkpoint**: zona opcional em todas as ações, sem itens presos nem duplicados na fila.

---

## Phase 6: User Story 3 — Ações de equipa e do adversário em poucos toques (Priority: P3) — Etapa 2c

**Goal**: remate do jogador, remates deles na linha do GR, saída do GR, transições, perdas/recuperações por zona e GR-linha.

**Independent Test**: quickstart.md "Etapa 2" passos 1, 2, 4, 5 (sem "−"), 6; contagem de toques conforme SC-003.

- [x] T042 [P] [US3] Em `apps/web/src/match/consola/ConsolaRow.tsx`, ativar "Remate ▸" → Defendido · Fora · Bloqueado · ✕ na própria linha (mesma altura), chamando `doRemate`; golo continua a ser `golo` (FR-008; densidade A com 8 ações)
- [x] T043 [US3] Na linha do GR em `apps/web/src/match/consola/ConsolaRow.tsx`, "Remate deles ▸" → Defendido (`defesa`, GR em campo) · Fora · Bloqueado (`remate_adv`, sem jogador) · ✕; ⋯ do GR com Saída 1x1 ganha/perdida (`saida`) (FR-009, FR-024)
- [x] T044 [US3] Em `apps/web/src/match/consola/TeamBar.tsx`, Transição a favor/contra → folha "Com finalização" / "Sem finalização", cada uma com os presets de `TRANSICAO_NUMEROS_VANTAGEM` e `TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM` (`goalTypes.ts`); um toque num preset regista `transicao` (`dir`, `resultado`, `transicaoNumeros`; nunca jogador) e fecha (FR-014, FR-015)
- [x] T045 [US3] Perdas/recuperações por zona (defesa, meio, ataque; sem jogador): coluna lateral no tablet (1 toque) e "Mais…" no iPhone (2 toques), em `apps/web/src/match/Consola.tsx` e `apps/web/src/match/consola/TeamBar.tsx` (FR-016)
- [x] T046 [US3] GR-linha em `apps/web/src/match/consola/TeamBar.tsx`: início/fim com duração sempre visível enquanto ativo; no iPhone ocupa o lugar de "Mais…", que passa para a doca; o fim regista `goleiro_linha_fim` com `durSec` (FR-017)

**Checkpoint**: todas as ações novas registáveis; contadores ainda sem "−".

---

## Phase 7: User Story 5 — Ver e corrigir as contagens durante o jogo (Priority: P3) — Etapa 2c

**Goal**: "−" por categoria (evento `anulacao`), contadores "1ª · total" e Resumo rápido completos.

**Independent Test**: quickstart.md "Etapa 2" passo 5 ("−" anula só o último da categoria, mostra o aviso; "Desfazer" repõe) e passo 7 (placar correto após "−" num golo sofrido).

- [x] T047 [US5] Em `apps/web/src/match/consola/TeamBar.tsx`, "−" ao lado de cada categoria de equipa (tablet: 1 toque; iPhone: via "Mais…" ou Resumo) chamando `doAnulacao` com o `alvoId` de `ultimoDaCategoria`; desativado quando não há nada a anular (FR-025)
- [x] T048 [US5] Faixa do último evento em `apps/web/src/match/Consola.tsx` mostra "Anulado: …" após um "−"; "Desfazer" de uma anulação usa o `undo()` local se ainda não foi enviada, senão anula a anulação
- [x] T049 [US5] Contadores "1ª n · total m" de todas as categorias a partir de `contarCategoria` (eventos efetivos) em `apps/web/src/match/consola/TeamBar.tsx` (FR-026)
- [x] T050 [US5] Completar `apps/web/src/match/consola/SummarySheet.tsx` com todas as categorias novas (remates por desfecho, remates deles, transições, perdas/recuperações por zona, GR-linha), sempre a partir de `eventosEfetivos` (FR-027)

**Checkpoint**: contagens corrigíveis em jogo sem apagar nada.

---

## Phase 8: User Story 4 — Transições desperdiçadas e exibição pós-jogo (Priority: P4) — Etapa 2d

**Goal**: o treinador vê as transições a favor sem finalização com vantagem real; os novos tipos aparecem no Resumo do jogo, Timeline e editor de registo.

**Independent Test**: quickstart.md "Etapa 2" passos 4 e 7; SC-004.

- [ ] T051 [P] [US4] Em `packages/engine/src/report.ts`, `transicoesDesperdicadas(events)`: `dir=ofensiva`, `resultado=perdida`, `transicaoNumeros` em `TRANSICAO_NUMEROS_VANTAGEM`, sobre `eventosEfetivos` (FR-019, FR-020; research Decisão 8)
- [ ] T052 [P] [US4] Testes em `packages/engine/test/report.test.ts`: exclui com finalização, igualdade/desvantagem, transições contra e anuladas
- [ ] T053 [P] [US3] (describeEvent dos tipos novos e da anulação já feito na 2c; falta: agregados) Em `packages/engine/src/report.ts`, `describeEvent` e agregados para os novos tipos e `anulacao`, a partir de `eventosEfetivos` (FR-021); testes em `packages/engine/test/report.test.ts`
- [ ] T054 [P] [US3] Em `packages/engine/src/timeline.ts`, novos tipos na timeline exportável e anulados marcados/excluídos; testes em `packages/engine/test/timeline.test.ts` (FR-021)
- [ ] T055 [US4] Em `apps/web/src/match/MatchSummary.tsx`, secção "Transições desperdiçadas com vantagem" e os novos agregados
- [ ] T056 [US3] Em `apps/web/src/match/MatchEventEditor.tsx`, mostrar e permitir corrigir os novos tipos e as anulações, sem apagar eventos já enviados (correções com `correcao: true`, como hoje)

---

## Phase 9: Portões e verificação — Etapa 2 (2a–2d)

**Purpose**: fecho da Etapa 2; aplica-se também a cada sub-etapa que o utilizador queira publicar isoladamente.

- [ ] T057 Com autorização: `npm test`, `npm test --workspace apps/web`, typecheck dos três pacotes (`./node_modules/.bin/tsc -p <pacote> --noEmit`), `npm run build --workspace apps/web`; relatar executado / não executado / só inspecionado
- [ ] T058 Confirmar por `git diff --stat` que não há ficheiros em `supabase/migrations/` nem alterações a `apps/web/src/match/LiveMatch.tsx`
- [ ] T059 [P] Atualizar `docs/ARCHITECTURE.md` com os novos tipos de evento, `eventosEfetivos`/anulação e o envio adiado da zona (Princípio VI)
- [ ] T060 Pedir ao utilizador a verificação manual de quickstart.md "Etapa 2" passos 1–8 (incluindo offline) no iPhone e no tablet, num jogo de teste; corrigir o que for reportado
- [ ] T061 Com autorizações separadas: commit local; push para `claude/fervent-fermi-q3zk57`; merge para `main` só por decisão do utilizador

---

## Phase 10: Polish & Cross-Cutting

- [ ] T062 [P] Rever textos visíveis da Consola em português do clube, sem jargão técnico, incluindo mensagens de erro (Princípio V)
- [ ] T063 [P] Atualizar `docs/prototipos/README.md` a indicar que a Consola real substitui o protótipo como referência (o protótipo fica como histórico)
- [ ] T064 Correr `/speckit-analyze` para consistência spec ↔ plan ↔ tasks e resolver divergências antes do merge para `main`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational Etapa 1 (2)** → **US1 (3)** = MVP publicável.
- **Etapa 2a (4)** não depende de código da Etapa 1, mas executa-se depois dela (o MVP vai primeiro para o jogo).
- **2b (5)**, **2c (6, 7)** e **2d (8)** dependem de 2a; 2b/2c precisam da Consola (Fase 3); 2d precisa só de 2a (motor) e das páginas existentes.
- **US5 (7)** depende da US3 (6) para as categorias novas (o "−" de golo sofrido funciona só com 2a + Fase 3).
- **Portões Etapa 2 (9)** depois das fases incluídas na publicação; **Polish (10)** no fim.

### Parallel Opportunities

- Fase 2: T004–T007 e T011 em paralelo (ficheiros distintos).
- Fase 3: T012, T014, T019 em paralelo; T013, T015–T018, T020–T021 em sequência sobre `Consola.tsx`/`ConsolaRow.tsx`.
- Fase 4: T033 e T034 em paralelo depois de T027–T031.
- Fase 5: T036, T037, T039 em paralelo; T038 isolado (fila de sincronização).
- Fase 8: T051–T054 em paralelo (engine) enquanto 2b/2c avançam na UI.

## Parallel Example: Etapa 1

```text
T004 layout.ts        | T006 flows.ts        | T011 theme.css
T005 layout.test.ts   | T007 flows.test.ts
→ T008 MatchFlow → T009 MatchHub → T010 Consola.tsx
→ T012 ConsolaRow | T014 TeamBar | T019 SummarySheet
```

## Implementation Strategy

1. **MVP = Fases 1–3 (Etapa 1 / US1)**: só `apps/web`, sem motor nem BD; verificação do utilizador num jogo de teste; publicação por decisão do utilizador.
2. **Etapa 2a** (motor, testável sem UI) → **2b** (zona) → **2c** (US3 + US5) → **2d** (US4 + exibição), cada uma com os seus portões; o utilizador pode publicar por sub-etapa.
3. Em cada paragem: relatar comandos executados, verificações não executadas e o que foi só inspecionado (CLAUDE.md).
