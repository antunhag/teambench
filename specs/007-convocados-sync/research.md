# Research: Robustez da seleção de convocados

## Decisão 1: Convocados/titulares viram eventos de jogo de verdade — reaproveitam `match_events` + outbox, nunca uma tabela nova

**Decisão**: Marcar/desmarcar um convocado ou titular passa a gerar um
`MatchEvent` de verdade (4 novos valores em `EventType`:
`convocado_add`/`convocado_remove`/`titular_add`/`titular_remove`), que entra
na MESMA fila de sincronização já usada por golo/cartão/substituição
(`apps/web/src/sync/outbox.ts` → `useOutboxSync.ts`, flush a cada 8s, upsert
por `client_event_id`). Nenhuma tabela nova, nenhuma coluna nova em
`match_events` (`type text not null` já aceita qualquer valor, sem CHECK
constraint — confirmado em `supabase/migrations/0001_init.sql:112`).

**Rationale**: `useLiveMatch.ts` hoje grava `convocadoIds`/`titularIds` SÓ em
`localStorage` (comentário explícito no código: "convocadoIds nunca chega a
ser sincronizado à parte"), exatamente a causa raiz do incidente que motivou
esta spec. A Constituição (Princípio I) já exige que "dados de jogo" sejam
event-sourced, nunca destrutivos, tolerantes a offline e a edição
concorrente — a seleção de convocados É dado de jogo (decide quem pode
entrar em quadra), só nunca foi tratada como tal. Mover para o mesmo
pipeline de eventos não é uma exceção nova: é alinhar algo que sempre devia
ter seguido a regra geral. Como bónus, isto resolve de graça a maior parte
de FR-001/FR-002 (offline-safe, sobrevive a reabrir noutro aparelho) sem
nenhum código de sincronização novo — só reaproveitando o que já existe e já
está testado em produção há vários jogos reais.

**Alternatives considered**: Tabela dedicada `match_squad` (como
`rotation_plan_stints`), escrita direto via Supabase — rejeitada porque essa
escrita direta NÃO é offline-safe (precisa de rede na hora), e construir uma
fila própria pra ela duplicaria o outbox já existente só pra um caso a mais.
Continuar em `localStorage`, só "melhorando" a persistência local (ex.:
IndexedDB) — rejeitada porque não resolve o requisito central (sobreviver a
TROCAR de aparelho), que exige necessariamente passar pelo Supabase.

## Decisão 2: Merge entre aparelhos por "última ação vence", por atleta — nunca reprodução ingênua de toggles

**Decisão**: O conjunto atual de convocados (ou titulares) é sempre
recalculado a partir de TODOS os eventos `convocado_add`/`convocado_remove`
conhecidos (locais + puxados do Supabase): para cada atleta, vale a ação
(`add` ou `remove`) do evento com o `ts` (timestamp de parede, campo já
existente em `MatchEvent`) mais recente entre todos. Nunca se aplica um
"toggle" (inverter o estado atual) como evento — cada marcação/desmarcação
grava explicitamente a intenção (`add` ou `remove`), não uma inversão.

**Rationale**: Um evento de "toggle" é ambíguo sob reordenação concorrente —
dois aparelhos que marcam o mesmo atleta quase ao mesmo tempo, sem saber um
do outro, podem produzir um resultado diferente dependendo da ordem em que
os eventos chegam depois. Um evento de intenção explícita (`add`/`remove`)
com "o `ts` mais recente vence" é determinístico não importa a ordem de
chegada — a mesma técnica (last-writer-wins por chave) já resolve o mesmo
problema noutros sistemas distribuídos simples, e aqui o "key" é só o
`playerId`. Reaproveita o `ts` que `MatchEvent` já carrega — não precisa de
nenhum campo novo.

**Alternatives considered**: Vetor de versões / CRDT mais sofisticado —
rejeitado por excesso de engenharia pro volume real (uma equipa tem no
máximo ~25 atletas, e o cenário de dois aparelhos editando ao mesmo tempo é
raro, não o caminho principal). Bloquear um 2º aparelho de editar enquanto o
1º estiver "a marcar" — rejeitado: a trava de edição (`useMatchLock`,
Decisão 7 abaixo) já é por UTILIZADOR, então os dois aparelhos em jogo aqui
são tipicamente a MESMA pessoa (ex.: telemóvel ficou sem bateria, mudou pro
tablet) — bloquear o próprio treinador de continuar noutro aparelho seria
pior do que o problema que resolve.

## Decisão 3: `convocadoIds`/`titularIds` passam a ser projeção pura dos eventos, não campos mutados direto

**Decisão**: Os campos `convocadoIds`/`titularIds` em `LiveMatchState`
continuam a existir com a mesma forma (array de ids) — mas deixam de ser
mutados diretamente por `toggleConvocado`/`toggleTitular`. Em vez disso,
essas duas funções passam a: (a) criar o `MatchEvent` correspondente
(`convocado_add`/`convocado_remove`/`titular_add`/`titular_remove`); (b)
recalcular `convocadoIds`/`titularIds` aplicando a Decisão 2 sobre
`state.events` já incluindo o evento novo. `toggleTitular` mantém a guarda
`if (state.started) return state` exatamente como hoje — intocada.

**Rationale**: Mantém a MESMA interface pros consumidores existentes
(`PreMatch.tsx`, `LiveMatch.tsx`, `MatchSummary.tsx`, `useRecentMinutes.ts`,
etc. já leem `state.convocadoIds`/`state.titularIds` como array simples) —
nenhum desses ficheiros muda. Só a FONTE da verdade muda (de "campo mutável"
pra "projeção de eventos"), mesmo padrão já usado pro resto do
`LiveMatchState` (clock, score, `onCourt` — tudo deriva de `state.events` via
replay). `toggleConvocado`/`toggleTitular` passam a usar `apply()` (que já
empilha undo e já enfileira no outbox) em vez do `setState` direto que hoje
os mantém fora dessa pilha.

**Alternatives considered**: Guardar só os eventos e recalcular
`convocadoIds` sob demanda em cada leitura (sem campo cacheado) — rejeitado
por custo de legibilidade (todo consumidor teria que chamar uma função em
vez de ler um campo) sem ganho real, já que recalcular a cada `apply()` é
barato (poucas dezenas de eventos, no máximo).

## Decisão 4: Sincronizar seleções de outro aparelho exige um "merge ativo", não só o `checkRemote` que já existe

**Decisão**: Novo efeito em `useLiveMatch.ts`, ativo só enquanto
`!state.started` (pré-apito): a cada ~10s, busca no Supabase os eventos
`convocado_*`/`titular_*` desse jogo que ainda não estão em `state.events`
(por `client_event_id`), funde-os no estado local (Decisão 2/3), e os
IGNORA pra fins de disparar sincronização de volta (já vieram do servidor,
não precisam voltar pra lá). Mesmo padrão de poll leve e só-leitura já usado
por `useLiveMatchPoint.ts` (specs/006-live-rotation-replan/).

**Rationale**: O `checkRemote` que já existe em `useLiveMatch.ts` só roda
UMA VEZ, ao montar, e só se `state.events.length === 0` — ou seja, só serve
pra "este aparelho nunca tocou neste jogo". Não serve pro caso real de
FR-010 (dois aparelhos ATIVOS ao mesmo tempo, cada um já com os próprios
eventos locais) nem detecta uma mudança feita noutro aparelho DEPOIS que
este já carregou. Pós-apito isto para de rodar porque, a partir daí, só
quem segura a trava de edição (`useMatchLock`) continua a escrever —
reabrir `checkRemote`'s replay já cobre o caso de reabrir um jogo já em
curso.

**Alternatives considered**: Supabase Realtime (subscription, em vez de
poll) — mais "instantâneo", mas introduz uma dependência nova (hoje a app
não usa nenhum canal realtime em lugar nenhum, só REST + poll) só pra um
cenário que, na prática, tolera bem uns segundos de atraso (o treinador não
está a decidir a seleção num ritmo de milissegundos). Fica como melhoria
futura se o poll se mostrar insuficiente.

## Decisão 5: User Story 2 (adicionar convocado pós-apito) fica quase de graça com as Decisões 1-3

**Decisão**: Nenhuma mudança adicional no motor — `toggleConvocado`
(diferente de `toggleTitular`) já NUNCA teve guarda de `state.started`
(confirmado: `packages/engine/src/liveMatch.ts`, função `toggleConvocado`),
e com a Decisão 1 já virou um evento sincronizado como outro qualquer. Só
falta a UI: um botão "+ Chamar atleta" perto do cabeçalho "Banco" em
`LiveMatch.tsx`, abrindo um seletor sobre `roster.filter(p =>
!state.convocadoIds.includes(p.id))` — ao escolher, chama
`live.toggleConvocado(id)` exatamente como `PreMatch.tsx` já faz.

**Rationale**: Confirma a intuição original da spec (FR-003 é "principalmente
um gap de UI, não engine/schema") — a investigação de código já tinha
identificado isso antes mesmo de abrir o plano.

**Alternatives considered**: nenhuma — caminho único e direto.

## Decisão 6: Mínimo de convocados exige dar ao Formato de Jogo uma capacidade de EDITAR que hoje não existe

**Decisão**: Nova coluna `min_convocados int null` em `match_formats`
(migração `0025`). `useMatchFormats.ts` ganha `updateFormat(id, patch)`
(hoje só tem `addFormat`/`setDefault` — não existe NENHUMA forma de editar
um formato já criado). `MatchFormats.tsx` ganha: um campo "Mín.
convocados (opcional)" no formulário de criar, E uma affordance de editar um
formato já existente (hoje a tela só lista + permite "Tornar padrão" —
editar nome/duração/mínimo de um formato já criado não é possível). O aviso
em si vive em `PreMatch.tsx`: compara `convocados.length` contra
`format.minConvocados` (quando não-null) e mostra um aviso não-bloqueante.

**Rationale**: Dado que a equipa real já tem formatos cadastrados em
produção (ex.: "SUB-15 DIVISÃO ELITE", já usado em jogos reais), um mínimo
só configurável na CRIAÇÃO de um formato novo seria inútil pra quem já tem
formatos — editar é obrigatório pra esta entrega ter valor prático
imediato, não é escopo extra por capricho.

**Alternatives considered**: Guardar o mínimo em outro lugar (ex.: por
equipa, não por formato) — rejeitado porque o utilizador já pediu
explicitamente "configuração do formato de jogo" ao discutir o escopo, e
`match_formats` já é exatamente o lugar certo pra regras que variam por
competição/escalão.

## Decisão 7: A trava de edição já é por UTILIZADOR — o cenário real de concorrência é um treinador em dois aparelhos, nunca duas contas

**Achado** (não uma decisão de design, uma correção de entendimento):
`claim_live_match` (`supabase/migrations/0009_live_match_lock.sql`) já
reivindica a trava "por utilizador, não por aparelho/aba" — o MESMO
utilizador em dois aparelhos sempre consegue editar em ambos; uma conta
DIFERENTE (ex.: assistente com login próprio) cai em modo leitura
(`ReadOnlyMatch.tsx`) e nunca chega a `PreMatch.tsx`/`toggleConvocado`. Ou
seja, o cenário de "duas pessoas editando ao mesmo tempo" descrito no
edge case da spec, na prática de hoje, só acontece como "o mesmo treinador,
dois aparelhos" — não duas contas simultâneas. Isto não muda nenhum
requisito (a Decisão 2 já cobre os dois casos de forma idêntica), só
precisa estar documentado pra não confundir quem ler esta spec depois.
