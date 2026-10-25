# Research: Captura detalhada de estatísticas (revisto 2026-10-25)

Decisões técnicas para a spec revista. Cada decisão cita a evidência no repositório.

## Decisão 1: Zero migração de schema

**Decisão**: Os novos tipos de evento usam a tabela `match_events` tal como está.

**Rationale**: `match_events.type` é `text not null` sem CHECK (`supabase/migrations/0001_init.sql`); a guarda de UPDATE (0026) e a FK composta de consistência de equipa (0027) não filtram por tipo; a policy de INSERT é a mesma para qualquer `type`. Campos novos vão no `payload` jsonb, como os existentes (`tipo`, `zona`, `transicaoNumeros`).

**Alternatives considered**: tabela própria para estatísticas detalhadas — rejeitada (duplicaria a fila de sincronização, a trava e o editor de registo).

## Decisão 2: A Consola reutiliza `MatchFlow` → `useMatchLock` + `useLiveMatch`

**Decisão**: Nova aba "Consola" em `MatchHub.tsx`, visível com a mesma condição que hoje controla o registo ao vivo (`canTrackLive`); monta `MatchFlow` numa variante que renderiza `Consola` em vez de `LiveMatch`.

**Rationale**: `MatchFlow.tsx` já garante que só quem tem a trava monta `useLiveMatch` (um escritor de cada vez). Reutilizar evita duplicar a lógica de motor (apito, substituição, pausa, fim de parte) — FR-001..006 ficam idênticos por construção. `LiveMatch.tsx` não é tocado (FR-029).

**Alternatives considered**: componente totalmente independente com o seu próprio hook — rejeitado (risco de divergir do motor e da trava).

## Decisão 3: Zona depois do lance sem UPDATE — enfileiramento adiado do último evento

**Decisão**: Quando um lance com zona opcional é registado, o evento entra **logo no estado local** (persistido em `localStorage` por `useLiveMatch`, por isso não se perde se a app fechar), mas o seu **envio para a fila (`outbox`) é adiado** até acontecer a primeira de: zona escolhida, painel fechado (✕), outra ação registada, ou um prazo curto (a afinar; ex. 10 s). Só então o evento é enfileirado, já com a zona, uma única vez.

**Rationale**: `apps/web/src/sync/outbox.ts` declara como invariante que um item enfileirado **nunca é recalculado** (a guarda 0026 depende disso para aceitar reenvios idênticos); alterar `zona` de um evento já enviado exigiria `correcao: true`. Adiar o enfileiramento resolve sem UPDATE e sem eventos de correção extra.

**Riscos e mitigação**: o evento pendente tem de ser enfileirado também ao desmontar a tela/fechar o jogo e ao recarregar a app (verificar no arranque eventos locais ainda não enfileirados — `useLiveMatch` já compara estado local com a fila); coberto por testes unitários da função de decisão "enfileirar agora?".

**Alternatives considered**: (a) UPDATE com `correcao: true` — rejeitado: polui o registo com correções a cada zona; (b) zona obrigatória antes de confirmar — rejeitado pelo piloto (agilidade, FR-011).

## Decisão 4: "−" por categoria = evento `anulacao` (só-acrescenta)

**Decisão**: O "−" regista um evento novo `anulacao` com `alvoId` = `clientEventId` do evento anulado (o último da categoria ainda não anulado). Uma função pura do motor projeta a lista efetiva de eventos, excluindo os anulados; placar, contadores, Resumo, Timeline e relatórios usam essa projeção. "Desfazer" de uma anulação = anular a anulação (mesmo mecanismo) ou o "Desfazer" local habitual se ainda não tiver sido enviada.

**Rationale**: apagar exige `team_admin` (`supabase/migrations/0011_match_events_delete.sql`) e quem regista ao vivo pode ser `data_entry`; o Princípio I proíbe escrita destrutiva sem confirmação; a fila é só-acrescenta. Um evento de anulação funciona offline, sincroniza como qualquer outro e mantém a auditoria.

**Alternatives considered**: DELETE — rejeitado (permissões, irreversível); UPDATE com marca "anulado" — rejeitado (alteraria um evento já enfileirado; ver Decisão 3).

## Decisão 5: Grelha de zonas = referência do clube (quadra inteira, deitada)

**Decisão**: Os valores 1-12 mantêm-se (`ZONAS_GOLO`); o significado é o da spec (Clarifications): nossa baliza à esquerda, colunas 1-3 | 4-6 ‖ 7-9 | 10-12, cada coluna de cima para baixo. A Consola desenha a grelha nessa disposição; o comentário de `packages/engine/src/goalTypes.ts` é corrigido na Etapa 2.

**Evidência**: hoje a folha do golo em `LiveMatch.tsx` mostra os 12 números numa grelha de 3 colunas (`.zonegrid`, `theme.css`) sem desenho do campo nem indicação de baliza — o significado sempre veio do modelo mental/Excel do clube, por isso os golos já registados podem ser lidos com esta definição. Alinhar a disposição visual do "Jogo ao vivo" com a da Consola fica **fora** desta feature (FR-029: não alterar o "Jogo ao vivo").

## Decisão 6: Layout adaptativo por viewport efetivo, com módulo puro testável

**Decisão**: `consola/layout.ts` decide modo (iPhone vertical / horizontal / tablet vertical / horizontal) e tamanho de botão (64 → 56 → 48 px, nunca abaixo de 48) a partir de medidas do viewport e da altura disponível; testado em `layout.test.ts`. A medição real de "cabe sem scroll" faz-se no componente, depois do render (como no protótipo).

**Evidência**: medidas reais do tablet (800×1106, 1280×626) e resultados de emulação no README do protótipo; `apps/web/vitest.config.ts` já suporta testes `node` em `apps/web/src`.

## Decisão 7: Fluxos de substituição/vaga como máquina de estados pura

**Decisão**: `consola/flows.ts` com um único estado de fluxo (`pick-out`, `pick-in`, `vacancy`), onde cancelar e concluir são transições distintas (FR-002, US1 cenário 6); testado em `flows.test.ts`.

**Evidência**: bug real encontrado no protótipo (intenção antiga consumida por um toque posterior) e corrigido com este desenho.

## Decisão 8: Relatório de transições desperdiçadas = função pura de filtro

**Decisão**: `transicoesDesperdicadas(events)` em `report.ts`: transições `dir=ofensiva`, `res=perdida` (sem finalização), superioridade em `TRANSICAO_NUMEROS_VANTAGEM`, excluindo anuladas. Consumida pelo Resumo do jogo.

## Decisão 9: Desfazer continua LIFO local; limites de parte não se desfazem

**Decisão**: o "Desfazer" da Consola usa o `undo()` de `useLiveMatch` (pilha local); fim/início de parte não são desfazíveis na Consola (como no protótipo); o relógio nunca recua com o desfazer. Correções antigas fazem-se com "−" (categorias de equipa) ou no editor de registo.
