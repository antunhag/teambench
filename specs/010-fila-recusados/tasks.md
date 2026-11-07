# Tasks: Lances recusados não bloqueiam a sincronização (010)

**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/estado-sincronizacao.md](./contracts/estado-sincronizacao.md),
[quickstart.md](./quickstart.md).

Trabalho na branch `claude/fervent-fermi-q3zk57`. Sem migrações. Testes sem rede (Princípio IV).

## Phase 1: Fundação

- [x] T001 [P] Criar `apps/web/src/sync/rejection.ts`: `classificarRecusa` (geral / alterado / sem_permissao / nao_existe / outro; sem SQLSTATE nem padrão conhecido conta como geral), `detalheDoErro`, `textoMotivo`, `textoRecusados` (research, Decisão 1; contrato)
- [x] T002 [P] Em `apps/web/src/sync/outbox.ts`, criar a lista de recusados por conta (`teambench.outbox.<ownerId>.recusados`) com `peekRejected`, `rejectedCount`, `moveToRejected` (escreve primeiro nos recusados e depois remove da fila), `updateRejected` e `removeRejected`. Uma lista ilegível nunca é sobrescrita (data-model)

## Phase 2: US1, um lance recusado não bloqueia os outros (P1)

- [x] T003 [US1] Em `apps/web/src/sync/outboxFlusher.ts`, quando o lote é recusado por um motivo do lance, enviar lance a lance. Uma recusa geral pára o ciclo e devolve `partial` (research, Decisão 2)
- [x] T004 [US1] Em `apps/web/src/sync/outboxFlusher.ts`, criar `retryRejected`: retira da lista os recusados que voltaram a estar na fila, faz ping e envia lance a lance (research, Decisão 4)
- [x] T005 [US1] Em `apps/web/src/sync/useOutboxSync.ts`, voltar a tentar os recusados no arranque, a cada `REJECTED_RETRY_MS` (5 min) e com `retryNow`. Garantir um envio de cada vez por execução
- [x] T006 [US1] Em `apps/web/src/match/useLiveMatch.ts`, incluir os recusados em `pendentes`. Se a lista for ilegível, `pendentes = null` (research, Decisão 5)

## Phase 3: US2, aviso em português (P1)

- [x] T007 [US2] Criar `apps/web/src/sync/RejectedNotice.tsx` e mostrá-lo em `App.tsx`, em `MatchFlow.tsx` e na Consola (pastilha "⚠ N recusados" que abre o aviso, visível também no iPhone; área de toque de 44 px ou mais). Classe `.cv-pill.rejected` em `theme.css`
- [x] T008 [US2] Expor no estado de sincronização `rejectedCount`, `rejectedReasons`, `rejectedOtherDetail` e `rejectedCorrupted`

## Phase 4: US3, uma recusa geral não põe nada de lado (P1)

- [x] T009 [US3] Testes em `apps/web/src/sync/rejected.test.ts`, cobrindo os 7 cenários do quickstart e os casos da revisão. Os 26 testes passam

## Phase 5: Fecho

- [x] T010 Atualizar `docs/ARCHITECTURE.md` com a secção "Fila de sincronização e lances recusados" (Princípio VI)
- [x] T011 Verificar o ecrã num ambiente offline com Playwright e um Supabase simulado, em 4 medidas: tablet deitado e em pé, iPhone na vertical e na horizontal. Sem scroll horizontal, sem erros, e o botão "Tentar outra vez" funciona
- [x] T012 Revisão do `code-reviewer`, porque o diff mexe na sincronização. Corrigidos:
  - B1: status 401 da resposta, cancelamento a meio do ciclo, "todos sem permissão sem nenhum aceite" tratado como sessão;
  - R1: retrato dos recusados antes da leitura;
  - R2: prazo de 15 s por pedido;
  - R3: erros transitórios do Postgres tratados como gerais;
  - R4: uma tentativa sem rede não conta;
  - O1: toque em "Tentar outra vez" durante um envio em curso aplicado no fim;
  - O5: acessibilidade da pastilha.

  O4 fica para uma entrega futura: dispensar recusados permanentes, com confirmação
- [x] T013 Portões de qualidade: `npm test`, typecheck dos 3 pacotes e build. Depois, commit e push para a branch
- [ ] T014 Verificação manual do utilizador (quickstart "Manual"). A publicação em `main` é decisão do utilizador
