# Data Model: Replaneamento de rotação durante o jogo

Nenhuma tabela nem coluna nova — esta feature só lê/escreve nas estruturas já
existentes (`rotation_plan_stints`, `players.availability_status`). As "entidades"
abaixo são formas de dado client-side, nunca persistidas como tal.

## `RotationStartPoint` (novo, client-side — parâmetro do motor)

| Campo | Tipo | Notas |
|---|---|---|
| `period` | `number` | Período a partir do qual gerar — períodos anteriores a este nunca entram na geração. |
| `elapsedSec` | `number` | Segundo (dentro do `period`) a partir do qual começar — turnos antes disso, no mesmo período, nunca entram na geração. |

Passado como parâmetro opcional pra `generateRotationOptions` (ver Decisão 1,
`research.md`). Ausente = comportamento atual (gera o jogo inteiro, período 1, segundo
0) — nenhuma mudança de comportamento pro plano pré-jogo existente.

## `StintsAfetados` (novo, client-side — resultado de uma função pura)

Resultado de cruzar os `rotation_plan_stints` já salvos contra a disponibilidade atual
e um `RotationStartPoint` — identifica quais turnos FUTUROS (a partir do ponto
informado) têm um atleta hoje marcado `indisponivel`.

| Campo | Tipo | Notas |
|---|---|---|
| `playerId` | `string` (uuid) | Atleta indisponível causando o conflito. |
| `stints` | `RotationStint[]` | Subconjunto dos stints já salvos, só os futuros (a partir do `RotationStartPoint`) que escalam esse atleta. |

Lista vazia (ou ausência de qualquer `StintsAfetados`) = nenhum aviso é mostrado
(Acceptance Scenario 2 da User Story 1). Calculado sob demanda (nunca persistido) toda
vez que a aba Rotações de um jogo ao vivo é aberta ou a disponibilidade de algum
atleta muda.

## `RotationPlanOption` (já existente, reaproveitado sem mudança de forma)

Mesma estrutura já usada pelo plano pré-jogo (`label`, `stints`, `totalSecondsByPlayer`
— ver `specs/004-rotation-plan-generation/data-model.md`). Quando gerada com um
`RotationStartPoint`, `stints` cobre só o intervalo [ponto atual, fim do jogo] — nunca
inclui turnos de períodos/segundos anteriores ao ponto de início. `totalSecondsByPlayer`
reflete só esse intervalo (não o jogo inteiro), já que o motor não tem visibilidade do
que já foi jogado antes do ponto de início.

## Funções novas/alteradas (contrato — `packages/engine`)

```ts
// rotationGenerator.ts — alterado: terceiro parâmetro posicional novo, opcional.
export function generateRotationOptions(
  players: Player[],
  weightsBySlot: PlayerSlotWeights,
  availabilityByPlayer: Record<string, AvailabilityStatus>,
  format: MatchFormat,
  startPoint?: RotationStartPoint // NOVO — ausente = jogo inteiro, igual hoje
): RotationPlanOption[]

// rotationPlan.ts — nova função pura.
export function stintsAfetadosPorIndisponibilidade(
  stints: RotationStint[],
  availabilityByPlayer: Record<string, AvailabilityStatus>,
  startPoint: RotationStartPoint
): StintsAfetados[]
```

## Fluxo de confirmação (client-side, `apps/web`)

1. `RotationPlanner.tsx` (jogo com status live) calcula `RotationStartPoint` a partir
   de `useLiveMatch`/`matchElapsedMs` + `state.period` já existentes.
2. Chama `stintsAfetadosPorIndisponibilidade` com os stints já carregados
   (`useRotationPlan`) — se não-vazio, mostra o aviso (US1).
3. Ao acionar "Gerar opções", chama `generateRotationOptions(..., startPoint)` — as
   3 opções cobrem só o intervalo restante.
4. Ao escolher uma opção: monta o array final = stints do plano atual com
   `period < startPoint.period` OU (`period === startPoint.period` E `endSec <=
   startPoint.elapsedSec`) — copiados sem alteração — concatenado com os stints da
   opção escolhida. Chama `saveStints` (já existente, sem mudança de assinatura) com
   esse array completo.
