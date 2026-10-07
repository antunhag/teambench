# Tasks: Acesso Multiusuário Robusto

**Input**: Design documents from `/specs/001-multi-user-access/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/rpc-functions.md](contracts/rpc-functions.md), [quickstart.md](quickstart.md)

**Tests**: Incluídos só pra `packages/engine` (lógica pura) — `apps/web` não tem infraestrutura de testes automatizados hoje (gap já registado no roadmap), então a validação das User Stories é manual, via `quickstart.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (ficheiros diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A que User Story da spec esta tarefa pertence (US1–US4)

---

## Phase 1: Setup

- [X] T001 Confirmar baseline verde antes de começar: `npm test --workspace packages/engine`, `npx tsc --noEmit -p apps/web`, `npm run build --workspace apps/web`

---

## Phase 2: Foundational

**Nenhum bloqueio real entre histórias nesta feature** — User Story 1 não precisa de nenhuma mudança de banco (reaproveita a trava do jogo tal como está); User Story 2 e User Story 3 trazem, cada uma, a sua própria migração independente. Por isso não há tarefas de fundação partilhada: pode começar direto pela Fase 3.

---

## Phase 3: User Story 1 - Ninguém mais edita o mesmo jogo ao mesmo tempo, nunca (Priority: P1) 🎯 MVP

**Goal**: Estender a trava de edição do jogo (já existente) pro corretor pós-jogo.

**Independent Test**: Cenário 1 do [quickstart.md](quickstart.md).

- [X] T002 [US1] Importar e chamar `useMatchLock(matchId)` em `apps/web/src/match/MatchEventEditor.tsx`, mesmo padrão já usado em `apps/web/src/match/MatchFlow.tsx:42`
- [X] T003 [US1] Quando `lock.status === "readonly"`, mostrar em `MatchEventEditor.tsx` uma mensagem clara em português ("Este jogo está a ser corrigido por outra pessoa agora") em vez das linhas editáveis — depende de T002
- [X] T004 [US1] Quando `lock.status === "checking"`, mostrar o mesmo estado "A carregar..." já usado em `MatchFlow.tsx`, evitando mostrar conteúdo editável antes da trava confirmar — depende de T002
- [X] T005 [US1] Validar manualmente com o Cenário 1 do `quickstart.md`, usando um jogo de TESTE (nunca um jogo real do clube) — depende de T003, T004 (confirmado no banco: `claim_live_match`/`release_live_match` disparam corretamente a partir do corretor pós-jogo; o teste de colisão entre DUAS contas reais fica pendente de verificação do utilizador)

**Checkpoint**: User Story 1 completa e testável sozinha — zero mudança de banco de dados.

---

## Phase 4: User Story 2 - Ninguém mais edita a mesma tela ao mesmo tempo, nunca (Priority: P1) 🎯 MVP

**Goal**: Mesma trava, generalizada, cobrindo Plantel, Formato de Jogo e Convites.

**Independent Test**: Cenário 2 do [quickstart.md](quickstart.md).

- [X] T006 [P] [US2] Escrever `supabase/migrations/0016_resource_locks.sql`: enum `lock_resource_type` (`roster`, `match_format`, `invites`); tabela `resource_locks` com chave primária composta `(team_id, resource_type)`, `holder_id` nullable, `heartbeat_at` nullable (ver `data-model.md`); RLS de select pra membros da equipa, sem policy de insert/update direta (só via função); funções `claim_resource_lock(p_team_id, p_resource_type)` e `release_resource_lock(p_team_id, p_resource_type)` `SECURITY DEFINER`, mesmo padrão de `claim_live_match`/`release_live_match` (migração 0009)
- [X] T007 [US2] Pedir revisão do subagente `security-auditor` na migração 0016 antes de aplicar (Princípio II da constituição) — depende de T006 (sem achados críticos/altos)
- [X] T008 [US2] Aplicar a migração 0016 no SQL Editor do Supabase (ação do utilizador) — depende de T007 (confirmado em produção: claim/release funcionam)
- [X] T009 [P] [US2] Criar `packages/engine/src/resourceLock.ts`: funções puras que calculam se a trava está livre, presa por "mim", ou presa por outra conta (com heartbeat ainda válido ou já obsoleto) — mesma lógica de estado que `useMatchLock` hoje mistura com I/O, aqui extraída e testável — depende de T006 (forma dos dados)
- [X] T010 [P] [US2] Testes em `packages/engine/test/resourceLock.test.ts` cobrindo: trava livre; trava minha; trava de outra conta com heartbeat válido; trava de outra conta com heartbeat obsoleto — depende de T009 (106/106 testes do pacote a passar)
- [X] T011 [US2] Criar `apps/web/src/team/useResourceLock.ts`, generalizando `apps/web/src/match/useMatchLock.ts` — parametrizado por `(teamId, resourceType)`, chama `claim_resource_lock`/`release_resource_lock` via `supabase.rpc`, heartbeat de 20s (Decisão 3 do `research.md`), usa `resourceLock.ts` (T009) pra formatar o estado — depende de T008, T009 (ganhou um parâmetro `enabled` extra: estas 3 telas ficam sempre visíveis no painel, a trava só entra em disputa quando há uma edição de facto em curso, nunca só por ver a lista)
- [X] T012 [US2] Ligar `useResourceLock(teamId, "roster", editingId !== null)` em `apps/web/src/team/Roster.tsx`: bloquear a edição com mensagem clara quando a trava pertence a outra conta — depende de T011
- [X] T013 [US2] Ligar `useResourceLock(teamId, "match_format", name !== "")` em `apps/web/src/team/MatchFormats.tsx` — depende de T011
- [X] T014 [US2] Ligar `useResourceLock(teamId, "invites", email !== "")` em `apps/web/src/team/TeamMembers.tsx` — só o formulário de gerar convite (composição multi-campo); remover membro/revogar convite continuam ações de um clique só, sem estado em progresso a perder, mesma lógica das outras 2 telas — depende de T011
- [X] T015 [US2] Validar manualmente com o Cenário 2 do `quickstart.md` nas 3 telas, incluindo confirmar que travas de telas diferentes não se bloqueiam entre si (FR-005) — depende de T012, T013, T014 (confirmado no banco: as 3 travas coexistem independentes; achado e corrigido durante a validação: `enabled` faltava no array de dependências do `useEffect` em `useResourceLock.ts`, fazendo a trava nunca ser reivindicada de verdade — ver commit)

**Checkpoint**: User Stories 1 e 2 completas — escopo mínimo viável (MVP) pronto, já que as duas são P1.

---

## Phase 5: User Story 3 - Admin consegue ver quem tem acesso e com que papel, com confiança (Priority: P2)

**Goal**: Histórico de acesso (quem entrou/saiu, quando, por quem) + proteção do último Admin.

**Independent Test**: Cenários 3 e 4 do [quickstart.md](quickstart.md).

- [X] T016 [P] [US3] Escrever `supabase/migrations/0017_access_log_and_last_admin.sql`: enum `access_log_event` (`granted`, `revoked`); tabela `team_access_log` (ver `data-model.md`); triggers `AFTER INSERT`/`AFTER DELETE on team_members` que a preenchem automaticamente (Decisão 4 do `research.md` — nunca escrita pelo cliente); função `list_team_access_log(p_team_id)` `SECURITY DEFINER` admin-gated, mesmo padrão de `list_team_members_with_email`; trigger `prevent_last_admin_removal` `BEFORE DELETE OR UPDATE on team_members` cobrindo remoção e despromoção (FR-010/FR-011), liberando quando há 2+ Admins (FR-012)
- [X] T017 [US3] Pedir revisão do subagente `security-auditor` na migração 0017 antes de aplicar — depende de T016 (1ª revisão: achado CRÍTICO — `accept_invite()` troca o papel via `ON CONFLICT DO UPDATE`, que dispara gatilhos de UPDATE, não INSERT/DELETE, passando batido pelo histórico e pela proteção do último Admin; reescrito cobrindo também `UPDATE OF role`, FKs tornadas nullable com `on delete set null` + snapshot de email, pra nunca bloquear apagar uma conta. 2ª revisão (pós-reescrita): mais 2 bugs de SQL encontrados e corrigidos — `FOR UPDATE` com `COUNT(*)` é sintaxe inválida; `target_email not null` podia ser violado no exato cenário de cascata de apagar conta que a reescrita tentava desbloquear. Sem achados pendentes)
- [X] T018 [US3] Aplicar a migração 0017 no SQL Editor do Supabase (ação do utilizador) — depende de T017 (aplicada; confirmado em produção via RPC `list_team_access_log`/`list_team_members_with_email` sem erros)
- [X] T019 [US3] Estender `apps/web/src/team/useTeamMembers.ts` pra chamar `list_team_access_log` e expor o histórico — depende de T018 (implementado com fallback silencioso se a migração ainda não tiver sido aplicada, pra não derrubar o resto da tela)
- [X] T020 [US3] Adicionar secção "Histórico de acesso" em `apps/web/src/team/TeamMembers.tsx` — depende de T019 (FR-009 já garantido estruturalmente: `TeamMembers` só é montado quando `team.role === "team_admin"` em `App.tsx:234`, não precisa de guarda extra; `list_team_access_log` também reforça isso no servidor)
- [X] T021 [US3] Capturar o erro do trigger `prevent_last_admin_removal` (T016) em `TeamMembers.tsx` e traduzi-lo numa mensagem clara em português ("é o único Admin da Equipa — promove outra pessoa primeiro") — depende de T018 (mesmo achado: o clique em "Remover" não tinha nenhum try/catch antes, corrigido junto)
- [X] T022 [US3] Validar manualmente com os Cenários 3 e 4 do `quickstart.md`, incluindo os 3 sub-casos do FR-010/011/012 (remover não-Admin, auto-remoção sendo único Admin, auto-remoção com 2+ Admins) — depende de T020, T021 (validado via a conta de teste `teambench.teste.dataentry@gmail.com`: troca de papel direta — ver T022b abaixo — confirmada ao vivo em produção, histórico gravou os 2 pares revoked/granted corretamente. Sub-caso "auto-remoção sendo único Admin" NÃO testado ao vivo — exigiria mexer na única conta team_admin real, risco alto/difícil de reverter se houvesse um bug; validado só por revisão de código, duas vezes, pelo `security-auditor`. Sub-caso "remover não-Admin via DELETE" bloqueado pelo classificador de permissões da sessão como alteração de recurso partilhado — não forçado; fica validado só por revisão de código)
- [X] T022b Escrever e aplicar `supabase/migrations/0018_direct_role_change.sql`: policy de UPDATE em `team_members` restrita a team_admin da própria equipa + trigger `prevent_team_member_identity_change` (impede mudar `team_id`/`user_id` via update); reaproveita os triggers de histórico/último-Admin da 0017 sem alterá-los. Ligar `changeRole(id, role)` em `useTeamMembers.ts` e um `<select>` de papel por membro em `TeamMembers.tsx`, substituindo o texto fixo do papel — fora do escopo original da spec (pedido do utilizador em follow-up: mudar papel não devia depender do atalho indireto de reconvidar). Revisado pelo `security-auditor` (sem achados), aplicado e validado ao vivo (ver T022)

**Checkpoint**: As três primeiras User Stories completas e testáveis.

---

## Phase 6: User Story 4 - Mensagens compreensíveis para quem não é técnico (Priority: P3)

**Goal**: Validação transversal da linguagem usada nas mensagens de bloqueio das US1–3.

**Independent Test**: Cenário 5 do [quickstart.md](quickstart.md).

- [X] T023 [US4] Reler juntas as mensagens de T003 (US1), T012/T013/T014 (US2) e T021 (US3) — confirmar que nenhuma expõe jargão técnico nem um erro bruto do Supabase/Postgres, consistente com o Princípio V da constituição — depende de T003, T012, T013, T014, T021 (revistas as 6 mensagens novas desta feature: as 4 travas usam o mesmo padrão "[Recurso] está a ser editado/editados por outra pessoa agora", consistentes entre si; as 2 mensagens de último-Admin (remover/mudar papel) usam o mesmo padrão "Não é possível... — é o único Admin da Equipa. Promove outra pessoa a Admin primeiro.", sem jargão, com ação clara a seguir. Nota, fora do escopo desta tarefa: os caminhos de erro genéricos de `saveError`/`addError`/etc. em todo o app — não só nesta feature — continuam a mostrar `error.message` bruto do Postgres/Supabase quando a falha não é uma das traduzidas; pré-existente, não introduzido aqui, fica registado como limitação conhecida)
- [X] T024 [US4] Validar manualmente com o Cenário 5 do `quickstart.md` (mostrar as mensagens a alguém sem contexto técnico) — depende de T023 (validação estrutural feita via revisão de texto acima; mostrar a um treinador/assistente real sem contexto técnico fica com o utilizador)

**Checkpoint**: Todas as 4 User Stories da spec completas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T025 [P] Atualizar `docs/ARCHITECTURE.md` com a trava genérica (`resource_locks`) e o histórico de acesso — Princípio VI da constituição, gate obrigatório antes do push (adicionadas secções "Trava de edição nas telas de gestão" e "Histórico de acesso e proteção do último Admin")
- [X] T026 [P] Atualizar `docs/SECURITY.md` com as tabelas/RLS/triggers novas e o resultado das revisões `security-auditor` de T007/T017 — Princípio VI (nova secção "Acesso multiusuário robusto (migrações 0016–0018)", incluindo as 2 rondas de revisão da 0017 e os 2 bugs de SQL corrigidos; risco aceite de cascata de apagar conta e o caso de deadlock raro registados em "O que ainda não está endurecido")
- [X] T027 Atualizar `docs/ROADMAP.md`: marcar "Robustecer o acesso multiusuário" como feito (movido pra nova secção "Feito recentemente"; adicionado o próximo item identificado — navegação multi-equipa com segregação de acesso — ao topo de "Agora")
- [X] T028 Rodar a secção "Regressão a conferir" do `quickstart.md` (fluxo normal do jogo ao vivo + suite Vitest completa) antes do commit final (106/106 testes de `packages/engine` a passar; `npx tsc --noEmit -p apps/web` e `npm run build --workspace apps/web` ambos limpos; fluxo normal do jogo ao vivo não re-testado manualmente nesta sessão — mudanças desta feature não tocam `match_events`/replay, risco considerado baixo)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **Foundational (Fase 2)**: vazia — nada bloqueia as User Stories entre si.
- **User Story 1 (Fase 3)**: só depende do Setup. Zero dependência de banco de dados.
- **User Story 2 (Fase 4)**: só depende do Setup. Independente da User Story 1 (migração própria).
- **User Story 3 (Fase 5)**: só depende do Setup. Independente das User Stories 1 e 2 (migração própria).
- **User Story 4 (Fase 6)**: depende das mensagens já existirem — na prática, roda depois de 1–3, mas não bloqueia nenhuma delas.
- **Polish (Fase 7)**: depende de quais User Stories tiverem sido entregues.

### Parallel Opportunities

- User Stories 1, 2 e 3 podem ser implementadas em paralelo (migrações e ficheiros independentes) — só colidem na tela `TeamMembers.tsx`, onde US2 (T014) e US3 (T020/T021) tocam o mesmo ficheiro em pontos diferentes.
- Dentro da User Story 2: T006, T009 podem começar em paralelo; T010 depende de T009.
- Dentro da User Story 3: T016 pode começar em paralelo com qualquer coisa de outra história.

---

## Parallel Example: User Story 2

```bash
# Em paralelo, assim que o Setup terminar:
Task: "Escrever supabase/migrations/0016_resource_locks.sql"
Task: "Criar packages/engine/src/resourceLock.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — as duas P1)

1. Completar a Fase 1 (Setup).
2. Completar a Fase 3 (User Story 1) — já é um incremento real e seguro, sem nenhuma migração.
3. Completar a Fase 4 (User Story 2).
4. **PARAR E VALIDAR**: rodar os Cenários 1 e 2 do `quickstart.md` antes de seguir.
5. Nesse ponto já há um MVP completo da feature — as duas prioridades P1 entregues.

### Entrega Incremental

1. Setup → Fundação (vazia, nada a fazer).
2. User Story 1 → validar → já pode ir pra produção sozinha (reduz o maior risco real, sem tocar em banco).
3. User Story 2 → validar → MVP completo.
4. User Story 3 → validar → histórico de acesso + proteção do último Admin.
5. User Story 4 → validação final da linguagem das mensagens.
6. Polish — documentação viva (Princípio VI) antes do commit/push final.

---

## Notes

- Cada migração (0016, 0017) passa pelo `security-auditor` antes de ser aplicada — nunca "a migração correu sem erro" como critério sozinho (Princípio II).
- Nenhuma tarefa aqui testa contra o jogo ou o plantel REAL do clube — sempre dados de teste (Princípio IV).
- `docs/ARCHITECTURE.md`/`docs/SECURITY.md` só são atualizados no fim (Fase 7), mas o gate da constituição exige que isso aconteça ANTES do push final, não depois.
