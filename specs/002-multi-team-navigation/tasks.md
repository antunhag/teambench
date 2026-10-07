# Tasks: Navegação Multi-Equipa com Segregação de Acesso

**Input**: Design documents from `/specs/002-multi-team-navigation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: Incluídos só pra `packages/engine` (lógica pura) — `apps/web` não tem
infraestrutura de testes automatizados hoje (gap já registado no roadmap), então a
validação das User Stories é manual, via `quickstart.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (ficheiros diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A que User Story da spec esta tarefa pertence (US1–US3)

---

## Phase 1: Setup

- [X] T001 Confirmar baseline verde antes de começar: `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`, `npm run build --workspace apps/web` (106/106 testes, typecheck e build limpos)

---

## Phase 2: Foundational

**Vazia, de propósito** — ao contrário da feature anterior (001, onde as 3 User
Stories tinham migrações independentes e corriam em paralelo), aqui há uma
dependência real: User Story 2 e User Story 3 estendem a casca de navegação que a
User Story 1 cria (`Nav.tsx`/`App.tsx`). Não há trabalho de fundação PARTILHADO que
não pertença já à User Story 1 — ver Dependencies abaixo pra a ordem real.

---

## Phase 3: User Story 1 - Encontrar qualquer coisa sem percorrer uma página infinita (Priority: P1) 🎯 MVP

**Goal**: Separar a página única de hoje (`App.tsx`) em ecrãs distintos, com uma
barra de navegação — sem ainda trocar de equipa nem filtrar por papel (isso é US2/US3).

**Independent Test**: Cenário 1 do [quickstart.md](quickstart.md).

- [X] T002 [P] [US1] Criar `apps/web/src/useActiveScreen.ts`: estado do ecrã ativo (id de item de navegação) + persistência em `localStorage` numa chave dedicada (nunca partilhada com as chaves de `sync/outbox.ts`/`useLiveMatch.ts`), com um valor por omissão quando ainda não há nada guardado (FR-008)
- [X] T003 [US1] Criar `apps/web/src/Nav.tsx`: barra de navegação com uma lista fixa de itens (Calendário, Plantel, Formato de Jogo, Acesso à Equipa — "Jogo ao Vivo"/corretor/planeador continuam a ser sub-fluxos abertos a partir de um jogo no Calendário, não itens de navegação à parte), todos sempre visíveis nesta fase (filtragem por papel é US3); usa `useActiveScreen` pra saber/mudar o ecrã ativo — depende de T002
- [X] T004 [US1] Reestruturar `apps/web/src/App.tsx`: trocar o empilhamento atual (todos os componentes sempre montados, um por baixo do outro) por uma casca (`Nav` + um ecrã montado de cada vez), reaproveitando os componentes já existentes (Calendar, Roster, MatchFormats, TeamMembers) exatamente como estão por dentro — só muda ONDE/QUANDO cada um é montado, nunca o seu conteúdo; `ClubSettings` passa a viver dentro do ecrã "Acesso à Equipa" (ambas são telas de administração, sem tab própria nesta feature) — depende de T003
- [X] T005 [US1] Validar manualmente com o Cenário 1 do `quickstart.md` — testado no browser: troca entre as 4 abas, persistência do ecrã ativo após F5, e o ecrã "Acesso à Equipa" mostrando Clube + Membros juntos — depende de T004

**Checkpoint**: User Story 1 completa e testável sozinha — já é um incremento real (resolve "tudo numa página só") mesmo sem nenhum utilizador multi-equipa.

---

## Phase 4: User Story 2 - Trocar de equipa sem terminar sessão (Priority: P2)

**Goal**: Quem pertence a 2+ equipas consegue ver todas e trocar entre elas, sem perder sessão nem misturar dados.

**Independent Test**: Cenário 2 do [quickstart.md](quickstart.md).

- [X] T006 [P] [US2] Criar `apps/web/src/team/useUserTeams.ts`: carrega TODAS as equipas do utilizador (`select role, teams(id, name) from team_members where user_id = ...`, sem `.limit(1)`), expõe a lista + a equipa selecionada + uma função de troca; persiste a última equipa selecionada em `localStorage` (Decisão 3 do `research.md`); ao carregar, usa a seleção guardada se ainda estiver na lista, senão a primeira da lista — depende de nada
- [X] T007 [US2] Remover `apps/web/src/team/useCurrentTeam.ts` e atualizar `apps/web/src/App.tsx` pra consumir `useUserTeams` em vez dele (Decisão 2 do `research.md` — substituição, não extensão) — depende de T006, T004
- [X] T008 [US2] Adicionar seletor de equipa (select no topbar de `App.tsx`), visível só quando o utilizador pertence a 2+ equipas (FR-003, Acceptance Scenario 3 — sem ruído pra quem só tem uma) — depende de T007, T003
- [X] T009 [US2] Em `useUserTeams.ts`, reconsultar a lista de equipas num intervalo (20s, mesma ordem de grandeza do heartbeat já usado em `useResourceLock.ts`) e ao recuperar o foco da janela; se a equipa selecionada sair da lista devolvida, mostrar um aviso claro e trocar para outra equipa válida da lista, ou para `null` ("sem equipa") se não restar nenhuma (FR-007, Decisão 5 do `research.md`) — depende de T006
- [X] T010 [US2] Validar manualmente com o Cenário 2 do `quickstart.md` — sem criar nenhuma equipa real nova: simulada uma 2ª equipa interceptando a chamada `fetch` do browser (nunca o banco), confirmado no navegador: seletor aparece só com 2+ equipas, trocar atualiza nome/papel/conteúdo de todos os ecrãs, seleção sobrevive a F5 (`localStorage`), e o sub-caso de perder acesso a meio da sessão mostra o aviso e cai de volta pra uma equipa válida corretamente — depende de T008, T009

**Checkpoint**: User Stories 1 e 2 completas — já cobre o caso real que motivou esta spec (alguém a ajudar em mais de uma equipa do clube).

---

## Phase 5: User Story 3 - A navegação só mostra o que dá para usar (Priority: P3)

**Goal**: Esconder completamente, na navegação, o que o papel do utilizador NA equipa selecionada não permite usar.

**Independent Test**: Cenário 3 do [quickstart.md](quickstart.md).

- [X] T011 [P] [US3] Criar `packages/engine/src/navigation.ts`: lista estática de itens de navegação (id, label, group `"jogo" | "gestao"`, minRole) cobrindo Calendário, Plantel, Formato de Jogo, Acesso à Equipa (ver `data-model.md`, entidade `NavItem`); função pura `visibleNavItems(role)` que devolve só os itens cujo `minRole` o papel cumpre; `ScreenId` também definido aqui (única fonte de verdade, `useActiveScreen.ts` reaproveita em vez de duplicar) — depende de nada
- [X] T012 [P] [US3] Testes em `packages/engine/test/navigation.test.ts`: cobrindo `viewer`, `data_entry` e `team_admin`, cada um vendo exatamente os itens esperados (nenhum a mais, nenhum a menos) — depende de T011 (4 testes, todos a passar)
- [X] T013 [US3] Trocar, em `apps/web/src/Nav.tsx`, a lista fixa criada em T003 por `engine.visibleNavItems(role)`; adicionado efeito que cai pro primeiro item visível quando o ecrã ativo guardado deixa de ser permitido pro papel atual (troca de equipa, ou perda de papel) — depende de T011, T003, T007
- [X] T014 [US3] Validar manualmente com o Cenário 3 do `quickstart.md` — simulado um papel `viewer` interceptando o `fetch` (sem tocar o banco): confirmado que "Acesso à Equipa" desaparece por completo da navegação (não fica desabilitado) e que o ecrã ativo cai automaticamente para "Calendário" em vez de ficar preso num ecrã escondido; Acceptance Scenario 4 (servidor continua a bloquear por fora da navegação) já garantido estruturalmente — RLS não foi tocado nesta feature — depende de T013, T008

**Checkpoint**: As três User Stories completas e testáveis — spec `002-multi-team-navigation` pronta pro Polish.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Atualizar `docs/ARCHITECTURE.md` com a nova casca de navegação (`Nav.tsx`/`useActiveScreen.ts`/`useUserTeams.ts`) e o conceito de equipa selecionada — Princípio VI da constituição, gate obrigatório antes do push (nova secção "Navegação e seleção de equipa" + "Estrutura de pastas" atualizada)
- [X] T016 Atualizar `docs/ROADMAP.md`: marcar "Navegação multi-equipa com segregação de acesso" como feito (movido pra "Feito recentemente"; aproveitado pra registar também a hierarquia "Admin do Clube" em "Mais tarde / exploração", prometida numa conversa anterior mas nunca escrita no ficheiro)
- [X] T017 Rodar a secção "Regressão a conferir" do `quickstart.md` antes do commit final (110/110 testes de `packages/engine` incluindo os 4 novos de `navigation.ts`; `tsc --noEmit` e `build` de `apps/web` limpos; fluxo de jogo ao vivo/corretor/planeador não tocado nesta feature — continua fora do `Nav`, mesma cadeia de `if/else` de antes — risco considerado baixo, não re-testado manualmente)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: vazia.
- **User Story 1 (Fase 3)**: só depende do Setup. Entrega valor sozinha (resolve "tudo numa página só"), mesmo sem ninguém multi-equipa.
- **User Story 2 (Fase 4)**: depende da Fase 3 estar feita (`Nav.tsx`/`App.tsx` já existem) — ao contrário da feature anterior, aqui NÃO é independente de outra User Story, por desenho (ver Phase 2 acima).
- **User Story 3 (Fase 5)**: depende da Fase 3 (`Nav.tsx` já existe) e, pra validar o cenário de papéis diferentes por equipa, da Fase 4 também — mas a lógica pura (`navigation.ts`, T011/T012) pode ser escrita e testada em paralelo com a Fase 4.
- **Polish (Fase 6)**: depende de todas as User Stories desejadas estarem entregues.

### Parallel Opportunities

- T002 (US1) e qualquer coisa de T011/T012 (US3, lógica pura em `packages/engine`) podem começar em paralelo, já que não tocam os mesmos ficheiros — mas T013 (ligar `navigation.ts` a `Nav.tsx`) só faz sentido depois de T003 e T007 existirem.
- T006 (US2, `useUserTeams.ts`) pode ser escrito em paralelo com a Fase 3 (US1) — só T007 (trocar `useCurrentTeam` por `useUserTeams` em `App.tsx`) precisa esperar o `App.tsx` reestruturado de T004.
- Dentro da User Story 3: T011 e T012 em paralelo entre si (T012 depende do resultado de T011, mas ambos em ficheiros diferentes de `packages/engine`).

---

## Parallel Example: Início da feature

```bash
# Em paralelo, assim que o Setup terminar:
Task: "Criar apps/web/src/useActiveScreen.ts"
Task: "Criar packages/engine/src/navigation.ts"
Task: "Criar apps/web/src/team/useUserTeams.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 sozinha)

1. Completar a Fase 1 (Setup).
2. Completar a Fase 3 (User Story 1) — já resolve o problema real de hoje (página única), mesmo sem multi-equipa.
3. **PARAR E VALIDAR**: rodar o Cenário 1 do `quickstart.md` antes de seguir.
4. Nesse ponto já há um MVP real, mesmo que as outras duas User Stories nunca cheguem a ser usadas (clube continuar com uma equipa só).

### Entrega Incremental

1. Setup → User Story 1 → validar → já pode ir pra produção sozinha.
2. User Story 2 → validar → quem ajuda em 2+ equipas já consegue trocar.
3. User Story 3 → validar → navegação reflete o papel em cada equipa.
4. Polish — documentação viva (Princípio VI) antes do commit/push final.

---

## Notes

- Nenhuma tarefa aqui precisa do `security-auditor` (Princípio II) — sem migração, sem RLS nova, sem função `SECURITY DEFINER` nova nesta feature.
- Nenhuma tarefa testa contra dados reais do clube — sempre contas/equipas de teste (Princípio IV).
- `docs/ARCHITECTURE.md` só é atualizado no fim (Fase 6), mas o gate da constituição exige que isso aconteça ANTES do push final, não depois.
