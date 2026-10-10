# Research: Replaneamento de rotação durante o jogo

## Decisão 1: O motor de geração ganha um ponto de início opcional — janela restante, não o jogo inteiro

**Decisão**: `generateRotationOptions` (packages/engine/src/rotationGenerator.ts) passa
a aceitar um parâmetro opcional de início (`{ period, elapsedSec }`) — quando ausente,
comportamento idêntico a hoje (gera o jogo inteiro desde o período 1, minuto 0); quando
presente, `scheduleWindowed` começa o cursor em `elapsedSec` (em vez de 0) pro período
informado, e períodos anteriores a esse nem entram na geração.

**Rationale**: É a única mudança estrutural necessária no motor pra servir tanto o
plano pré-jogo (sem início, como hoje) quanto o replaneamento ao vivo (início = ponto
atual do jogo). Mantém o motor puro e sem nenhuma dependência de tempo real/relógio —
quem calcula "o ponto atual do jogo" continua sendo a camada de UI
(`useLiveMatch.ts`, que já expõe `elapsedMs`/`period`), o motor só recebe um número.

**Alternatives considered**: Criar uma função nova separada
(`generateRemainingRotationOptions`) em vez de estender a existente — rejeitado por
duplicar quase toda a lógica de `scheduleWindowed`/`assignWindow` (streak, cooldown,
teto de minutos de specs/005 quando existir) só pra mudar o ponto de partida; um
parâmetro opcional é a mudança mínima que cobre os dois casos sem duplicação.

## Decisão 2: Nenhum ponto de entrada novo pra marcar indisponibilidade — reaproveita o Plantel

**Decisão**: Marcar um atleta indisponível continua sendo feito exclusivamente no
Plantel (`Roster.tsx`, via `usePlayers.ts`'s `setAvailability`) — igual hoje. Esta
feature não adiciona nenhum atalho novo (ex.: um botão "marcar indisponível" dentro da
tela do jogo ao vivo). O que é novo é só a REAÇÃO: quando o treinador está na aba
"Rotações" de um jogo ao vivo, o sistema cruza o `availability_status` atual de cada
atleta com os turnos futuros do plano já escolhido, e mostra o aviso se houver conflito.

**Rationale**: `Roster.tsx` já é alcançável a qualquer momento (é uma tela de nível
superior, não trancada por estado de jogo) — o treinador já consegue marcar um atleta
indisponível no meio de um jogo real hoje, só que ninguém reage a isso depois. Resolver
só a reação (não o ponto de entrada) é a menor mudança que atende FR-001/FR-002 da
spec, e evita introduzir um segundo lugar que escreve `availability_status` (mais
superfície pra manter consistente).

**Alternatives considered**: Adicionar um controle de disponibilidade direto na aba
Rotações ou dentro de `LiveMatch.tsx`, pra não precisar trocar de tela no meio do jogo
— não descartado por princípio, mas adiado: a spec não pediu isso explicitamente, e
"reagir a uma mudança que já é possível fazer hoje" é suficiente pra entregar o valor
descrito nas User Stories 1 e 2. Pode virar uma melhoria de UX numa iteração seguinte,
se o fluxo de trocar de tela se mostrar desconfortável na prática.

## Decisão 3: A UI vive dentro do `RotationPlanner.tsx` já existente, "ciente" do jogo ao vivo

**Decisão**: Nenhum componente novo dentro de `LiveMatch.tsx`. `RotationPlanner.tsx`
passa a saber quando o jogo está com `status === "live"` (ou equivalente) e, nesse
caso: (a) calcula o ponto atual do jogo via `useLiveMatch`/`matchElapsedMs` já
existente; (b) cruza esse ponto + disponibilidade atual contra os `rotation_plan_stints`
já salvos, mostrando o aviso de turnos futuros afetados (US1) acima da grelha normal;
(c) o botão "Gerar opções de plano" já existente, nesse contexto, passa a gerar só a
partir do ponto atual (Decisão 1), em vez do jogo inteiro — os cartões de opção e o
fluxo de "Escolher esta" continuam sendo exatamente os mesmos componentes já usados
pelo plano pré-jogo.

**Rationale**: `RotationPlanner.tsx` já é alcançável durante um jogo ao vivo (a aba
"Rotações" não é bloqueada por status do jogo — confirmado por investigação direta do
código) — não existe nenhuma razão técnica pra duplicar a UI de geração/escolha de
opções num componente novo. Reaproveitar reduz a superfície de código a manter e
mantém o treinador numa única tela mental pra "mexer no plano", em vez de espalhar
essa responsabilidade entre `LiveMatch.tsx` e `RotationPlanner.tsx`.

**Alternatives considered**: Um widget dedicado dentro de `LiveMatch.tsx` (perto do
aviso "turno encerra em breve" já existente) — rejeitado por duplicar a UI de
opções/confirmação que já existe e funciona bem em `RotationPlanner.tsx`; o treinador
já sabe ir à aba Rotações pra mexer no plano, não precisa aprender um segundo lugar.

## Decisão 4: Persistência reaproveita `saveStints` sem mudar assinatura — quem chama monta o array completo

**Decisão**: `useRotationPlan.ts`'s `saveStints` (hoje: apaga todos os stints do plano
e reinsere a lista completa recebida) continua exatamente como está. Ao confirmar um
replaneamento, a UI monta o array final = todos os stints com `period`/`startSec` já
passados (inalterados, copiados do plano atual) + os novos stints gerados pra janela
restante — e chama `saveStints` com esse array completo, igual a qualquer outra edição
de plano hoje.

**Rationale**: `saveStints` já é "apaga tudo e reinsere" (não incremental) — tentar
fazer um "update parcial só dos turnos futuros" exigiria uma função nova de
persistência, só pra economizar reescrever linhas que de qualquer forma não mudam de
valor. Como o array final inclui os turnos passados sem alteração nenhuma, o resultado
no banco é idêntico ao de um update parcial, sem precisar de código novo de
persistência — e garante por construção que nunca existe uma janela de inconsistência
entre "turnos passados" e "turnos futuros" sendo gravados em momentos diferentes.

**Alternatives considered**: Função de persistência nova, tipo `replaceFutureStints`,
fazendo delete+insert só da fatia futura — rejeitado por ser otimização prematura (o
volume de linhas por jogo é pequeno, ~20-40 stints no total) que adicionaria uma
segunda forma de gravar o mesmo dado, aumentando a chance de inconsistência entre as
duas em vez de reduzir.

## Decisão 5 (encontrada durante a implementação da US1): "Ponto atual do jogo" nunca reaproveita `useLiveMatch` direto — hook novo, só leitura, mesmo padrão já seguro de `ReadOnlyMatch.tsx`

**Histórico**: A Decisão 3 (acima) assumia "calcula o ponto atual do jogo via
`useLiveMatch`/`matchElapsedMs` já existente" sem detalhar COMO — a investigação do
código, ao implementar T006, encontrou que `useLiveMatch` só é montado por quem detém
a trava do jogo (`useMatchLock`, ver comentário em `MatchFlow.tsx`: "Só quem
reivindicar a trava do jogo... chega a montar useLiveMatch — quem está em modo leitura
não deve tocar em localStorage/outbox do jogo de outra pessoa"). `RotationPlanner.tsx`
não é gated por essa trava — monta mesmo que outro aparelho já esteja a registar o
jogo ao vivo.

**Decisão**: Criado `apps/web/src/match/useLiveMatchPoint.ts` — hook novo, exclusivamente
de leitura, que busca `match_events` já sincronizados do Supabase (mesmo padrão já
usado por `ReadOnlyMatch.tsx`, poll a cada 15s) e reconstrói o `RotationStartPoint`
via `engine.replayEvents`/`engine.matchElapsedMs` (funções puras já existentes, mesmas
usadas pelo caminho de fallback do próprio `useLiveMatch` quando reabre um jogo sem
progresso local). NUNCA toca `localStorage`, nunca enfileira na `outbox`, nunca
reivindica a trava — não é capaz de interferir com quem está de facto a registar o
jogo.

**Rationale**: Montar uma 2ª cópia de `useLiveMatch` (localStorage própria, relógio
próprio, fila de sincronização própria) a partir de um contexto sem a trava é
exatamente o tipo de edição concorrente sem aviso que o Princípio I da constituição
("correção dos dados de jogo acima de tudo") pede pra tratar como normal, não exceção
— mas aqui dava pra EVITAR o risco inteiramente, em vez de só "aceitar que pode
acontecer". Reaproveitar `replayEvents`/`matchElapsedMs` (em vez de reimplementar a
reconstrução do relógio) mantém uma única fonte de verdade pra "como calcular o tempo
decorrido a partir de eventos", já testada pelo resto do motor.

**Alternatives considered**: Levantar `useLiveMatch` pra `MatchHub.tsx` e passar `live`
como prop pra `MatchFlow` e `RotationPlanner` — rejeitado: exigiria tirar o gate de
`useMatchLock` de dentro de `MatchFlowEditor` (onde vive hoje, depois do `lock.status`
já ter sido checado) pra um nível acima que não tem essa checagem, abrindo a mesma
falha de concorrência que o gate existe pra evitar. Reconstruir o estado a partir de
`buildTimelineData` (já usado por `ReadOnlyMatch.tsx`) em vez de `replayEvents` —
rejeitado por não expor um `clock`/`period` com a mesma precisão de segundo que
`matchElapsedMs` precisa; `buildTimelineData` já agrega pra exibição, não pra cálculo.

## Decisão 6 (encontrada durante a implementação da US2): preservar turnos passados ao aplicar um replaneamento exige RECORTAR o turno em andamento, nunca mantê-lo inteiro

**Histórico**: A Decisão 4 (acima) descreve montar o array final como "todos os stints
com `period`/`startSec` já passados (inalterados) + os novos stints gerados" — a
implementação inicial de `chooseOption` (`RotationPlanner.tsx`) usou
`localStints.filter((s) => !isStintFuture(s, livePoint))` pra isolar os turnos
"passados" a preservar. Verificação ao vivo contra o jogo `teste4` expôs o bug: a soma
de `MINUTOS PREVISTOS` deu 15368s em vez dos 14400s esperados (4 vagas × 3600s), uma
sobreposição de exatamente 242s × 4 vagas. Causa: `isStintFuture` classifica um turno
EM ANDAMENTO no momento do replaneamento (ex.: Pivô 0-300s, com `elapsedSec≈58`) como
"não futuro" — então o filtro preservava esse turno INTEIRO (0-300) — enquanto a
geração nova (Decisão 1) também cobre a partir de `elapsedSec=58` na mesma vaga,
duplicando a cobertura do intervalo `[58, 300)`.

**Decisão**: Nova função `clippedPastStints(stints, startPoint)` em
`packages/engine/src/rotationPlan.ts` — mesma regra de "o que preservar" de
`isStintFuture`, mas um turno em andamento no momento exato de `startPoint` tem seu
`endSec` RECORTADO pra `startPoint.elapsedSec` em vez de mantido inteiro. `chooseOption`
passa a montar o array final com `clippedPastStints(localStints, livePoint)` + os
stints da opção escolhida, nunca mais com o filtro baseado só em `isStintFuture`.
`isStintFuture` continua existindo exatamente como estava — segue correto pro seu uso
original (`stintsAfetadosPorIndisponibilidade`, US1: decidir se vale a pena AVISAR,
onde um turno em andamento genuinamente não precisa de aviso) — só ganhou um aviso no
docstring deixando explícito que não serve pra decidir o que preservar na persistência.

**Rationale**: As duas perguntas são diferentes mesmo parecendo a mesma checagem de
tempo: "isto já é passado o bastante pra não precisar de aviso?" (US1) vs. "isto é
exatamente o que preservar sem duplicar com a geração nova?" (US2/persistência). A
primeira pode tratar "em andamento" como "não é futuro, não avisa" sem problema — o
treinador já sabe quem está em quadra agora. A segunda não pode, porque a geração nova
sempre recomeça do zero exatamente em `elapsedSec`, então QUALQUER parte do turno em
andamento que vá além de `elapsedSec` já está coberta de novo pela opção escolhida.

**Alternatives considered**: Fazer a geração nova começar DEPOIS do fim do turno em
andamento (ex.: `elapsedSec` arredondado pro próximo turno) — rejeitado: a opção
escolhida deixaria de cobrir o intervalo `[elapsedSec, fim do turno em andamento)`,
criando um BURACO em vez de sobreposição, e complicaria `generateRotationOptions` com
um segundo parâmetro (quando o turno em andamento termina) que a Decisão 1 nunca
precisou. Recortar o turno passado é a correção mínima — não muda nada na geração
(Decisão 1 permanece exatamente como está, já testada), só na montagem do array final.
