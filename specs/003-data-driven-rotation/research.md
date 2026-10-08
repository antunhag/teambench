# Research: Motor de Sugestão de Rotação Baseado em Dados

## Decisão 1: "A retomar" expira sozinho ao ser usado num plano, não por data/jogo específico

**Decisão**: `players.availability_status` é uma coluna simples (`apto` por
omissão), sem nenhuma coluna de "pra que jogo serve". Quando o treinador
guarda um plano de rotação (`saveStints` em `useRotationPlan.ts`) e esse
plano inclui um atleta marcado `a_retomar`, o próprio ato de guardar o plano
reverte esse atleta pra `apto`, automaticamente, como último passo da mesma
operação.

**Rationale**: FR-007 exige que "A retomar" valha só pro próximo jogo
planeado, voltando a "Apto" sozinho depois — mas marcar o estado acontece no
Plantel (FR-008), de forma genérica, sem o treinador escolher "pra qual
jogo" no momento de marcar. Ligar o estado a um `match_id` específico exigia
escolher isso na hora de marcar (mais um passo, contra o Princípio V) e lidar
com o caso de nunca chegar a usar (o jogo é adiado, cancelado). Reverter no
momento em que o plano É DE FACTO usado evita os dois problemas: o estado
"sobrevive" até ser relevante de verdade, nunca expira sozinho por tempo.

**Alternatives considered**: Coluna `availability_applies_to_match_id`
(nullable, aponta pro próximo jogo) — mais preciso, mas exige escolher o
jogo na hora de marcar (ou adivinhar "o próximo"), e lidar com jogos
adiados/cancelados deixando o estado preso. Rejeitado por complexidade
desproporcional ao pedido original.

## Decisão 2: Minutos recentes agregam os últimos 5 jogos terminados, não uma janela de tempo

**Decisão**: "Jogos recentes" (FR-004, contexto de maturação) significa os 5
jogos mais recentemente TERMINADOS (`status = 'finished'`) desta equipa, não
uma janela de calendário (ex.: "últimos 30 dias").

**Rationale**: Um futsal de formação joga em ritmo irregular (pausas de
época, jogos remarcados) — uma janela de tempo fixa podia incluir 1 jogo ou
12, dependendo da altura da época. Contar por JOGOS, não por tempo, dá uma
amostra mais estável do nível de rodagem recente de cada atleta,
independente do calendário. 5 é um número pequeno o suficiente pra refletir
o momento atual (não a época toda) e grande o suficiente pra não ser
dominado por um jogo isolado em que alguém jogou pouco por acaso (lesão de
outro, tática pontual).

**Alternatives considered**: Janela de tempo (ex.: 30 dias) — rejeitada pela
irregularidade do calendário. Toda a época — rejeitada por diluir demais o
"momento atual" do atleta (o pedido original fala em "tempo em jogos
anteriores" no sentido de rodagem recente, não histórico de carreira).

## Decisão 3: Minutos agregados calculados no cliente, reaproveitando `replayEvents`

**Decisão**: `useRecentMinutes.ts` busca os eventos dos 5 jogos mais
recentes terminados (consulta direta ao Supabase, mesmo padrão já usado em
`useRotationPlan`/`useLiveMatch`), e uma função nova e pura em
`packages/engine` (`aggregateRecentMinutes`) chama `replayEvents` pra cada
jogo e soma os minutos por atleta através deles.

**Rationale**: `replayEvents` já existe, já é a única fonte de verdade pra
"quanto tempo um atleta esteve em quadra" (usado hoje no Resumo/Timeline de
um jogo) — reconstruir essa lógica em SQL seria duplicar uma regra de
negócio real (substituições, cartões vermelhos, etc.) em duas linguagens
diferentes, arriscando divergir. Reaproveitar o motor existente, só chamado
mais vezes (uma por jogo recente) e agregado, é mais simples e mais seguro.

**Alternatives considered**: Uma view/função SQL que pré-calcula minutos —
rejeitada: replicaria em SQL uma lógica de replay de eventos já madura e
testada em TypeScript, só pra evitar algumas chamadas extra ao Supabase (o
volume é pequeno — 5 jogos, plantel de ~20 atletas — não justifica a
duplicação).

## Decisão 4: Estado do atleta e aptidão continuam conceitos separados, não fundidos

**Decisão**: `availability_status` (novo) e `player_aptitudes.quality`
(já existente, A/B/C por vaga) ficam como dois conceitos distintos — estado
é UMA coisa por atleta (não por vaga), aptidão continua por vaga.

**Rationale**: Confirmado com o dono do produto: aptidão é "o quão bom é
este atleta nesta vaga" (relativamente estável, revisto de vez em quando);
estado é "como está este atleta agora" (lesão, a retomar — muda semana a
semana, igual pra todas as vagas que ele joga). Misturar os dois (ex.: um
"B" temporário por lesão) obrigaria a tocar em `player_aptitudes` toda
semana por um motivo que não tem nada a ver com a avaliação técnica do
atleta na vaga.

**Alternatives considered**: Nenhuma seriamente considerada — a separação já
estava implícita na forma como o utilizador descreveu o pedido ("mescla de
aptidão... e estado do atleta", claramente dois ingredientes distintos).
