# Data Model: Geração automática de plano de rotação completo

Uma tabela nova (`rotation_plan_weights`) com RLS nova — exige revisão do
`security-auditor` antes de aplicar (ver Constitution Check em `plan.md`). Nenhuma
outra tabela é alterada; `rotation_plans`/`rotation_plan_stints` (migração 0012)
continuam exatamente como estão — uma opção escolhida vira turnos nessas mesmas
tabelas, sem diferença de uma opção montada à mão.

## `rotation_plan_weights` (nova)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `match_id` | `uuid not null references matches(id) on delete cascade` | Peso é escopado a UM jogo — nunca persiste pra outros jogos do mesmo atleta (ver Assumptions do `spec.md`). |
| `team_id` | `uuid not null references teams(id) on delete cascade` | Denormalizado, mesmo padrão de `rotation_plan_stints` — usado direto na RLS, sem join. |
| `player_id` | `uuid not null references players(id) on delete cascade` | |
| `slot_type` | `text not null check (slot_type in ('Fixo','Ala Esquerda','Ala Direita','Pivô'))` | Mesmas 4 vagas fixas já usadas em `player_aptitudes`/`rotation_plan_stints`. |
| `weight` | `int not null check (weight between 1 and 5)` | Escala discreta curta (Decisão 2, `research.md`) — nunca um número livre. |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | Trigger `set_updated_at()` já existente, reaproveitado. |

**Unicidade**: `unique (match_id, player_id, slot_type)` — um único peso vigente por
combinação; ajustar de novo faz `upsert`, nunca acumula histórico.

**RLS**: mesmo padrão de `rotation_plan_stints` — `select` por `team_id in
my_team_ids()`; `insert`/`update`/`delete` restritos a `team_admin`
(`has_team_role(team_id, array['team_admin'])`), já que planeamento tático é
atribuição de Admin da Equipa, não do Lançador de dados (mesmo raciocínio documentado
em `0012_rotation_plans.sql`).

**Quem escreve**: só `team_admin`, mesmo papel que já monta o plano manual.

## `AthleteWeight` (client-side, deriva da tabela acima + aptidão/estado)

| Campo | Tipo | Notas |
|---|---|---|
| `playerId` | `string` (uuid) | |
| `slot` | `RotationSlotType` | |
| `weight` | `1 \| 2 \| 3 \| 4 \| 5` | Valor salvo (se já ajustado) ou o padrão sugerido (Decisão 3, `research.md`), nunca persistido até o treinador mexer — evita escrever 80 linhas (20 atletas × 4 vagas) só por abrir a tela. |
| `isDefault` | `boolean` | `true` se ainda é o valor sugerido automático, `false` se o treinador já ajustou manualmente — só cosmético na UI (ex.: destacar o que foi tocado), não afeta a geração. |

## `RotationPlanOption` (client-side, nunca persistido enquanto não escolhido)

Um dos 3 planos completos gerados — ao ser escolhido, vira turnos reais em
`rotation_plan_stints` (via `saveStints`, já existente), indistinguível a partir daí
de um turno montado à mão.

| Campo | Tipo | Notas |
|---|---|---|
| `label` | `string` | "Até 5 minutos por turno" / "Até 3 minutos por turno" / "Até 2 minutos por turno" (Decisão 4, `research.md`, revista 2026-10-09) — nome em português, nunca "Opção 1/2/3" sem contexto. |
| `stints` | `RotationStint[]` | Mesmo tipo já existente em `packages/engine/src/rotationPlan.ts` — a opção É uma lista de turnos, pronta pra virar o plano salvo sem transformação. |
| `totalSecondsByPlayer` | `Record<string, number>` | Derivado de `plannedSecondsByPlayer(stints)` já existente — usado só pra mostrar ao treinador o resumo antes de escolher, não é um dado novo guardado. |

**Geração**: `generateRotationOptions(players, weightsBySlot, availabilityByPlayer,
format): RotationPlanOption[]` (nome final definido na implementação) — pura, em
`packages/engine`, reaproveita `stintsOverlap`/`playerOverlapsOtherSlot` já
existentes pra nunca produzir um plano internamente inconsistente.
