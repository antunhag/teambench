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
