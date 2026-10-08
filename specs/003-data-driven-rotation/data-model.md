# Data Model: Motor de Sugestão de Rotação Baseado em Dados

Duas colunas novas numa tabela já existente (`players`), nenhuma tabela
nova. Sem RLS nova — ver Constitution Check em `plan.md`.

## `players` (alterada — 2 colunas novas)

| Coluna | Tipo | Notas |
|---|---|---|
| `availability_status` | `text`, `not null default 'apto'` | `check (availability_status in ('apto', 'a_retomar', 'indisponivel'))`. |
| `availability_note` | `text`, nullable | Motivo livre e curto (ex.: "Entorse no tornozelo") — só contexto pro treinador, nunca usado em nenhuma lógica. |

**Validação**: `availability_status` restrito ao enum — não é texto livre,
pra nunca divergir do que o código realmente usa (mesmo princípio já
aplicado a `lock_resource_type`/`access_log_event` noutras features).

**Transições de estado**: `apto` (padrão) → `a_retomar` ou `indisponivel`
(o treinador marca no Plantel) → `apto` de novo, de duas formas diferentes
(ver Decisão 1 do `research.md`):
- `indisponivel` → `apto`: só manual, o treinador reverte quando o atleta
  está mesmo recuperado.
- `a_retomar` → `apto`: automático, no momento em que um plano de rotação
  que inclui esse atleta é guardado (`saveStints`) — nunca exige o
  treinador lembrar de reverter.

**Quem escreve**: `team_admin`, mesma policy `players_update_coach` já
existente (sem mudança) — o mesmo papel que já edita posição/número/ativo
no Plantel.

## `RecentMinutes` (client-side, não guardado)

Agregação calculada no momento, nunca persistida — ver Decisão 3 do
`research.md`.

| Campo | Tipo | Notas |
|---|---|---|
| `playerId` | `string` (uuid) | |
| `totalMs` | `number` | Soma de `replayEvents(...).clockAcc.secondsPlayed` (× 1000) através dos 5 jogos mais recentes terminados (Decisão 2) — `onCourtSince` só existe enquanto o relógio está a correr; num jogo terminado já está vazio, o tempo assentado fica em `secondsPlayed`. |
| `gamesCounted` | `number` | Quantos dos 5 jogos recentes esse atleta efetivamente teve algum tempo em quadra (0 a 5) — usado pra distinguir "jogou pouco" de "nem esteve convocado". |

**Fonte**: os 5 jogos mais recentes com `status = 'finished'` desta equipa
— `match_events` de cada um, replayados com `engine.replayEvents` (já
existente), nunca escritos.

## `RotationSuggestion` (client-side, não guardado)

Por vaga (Fixo/Ala Esquerda/Ala Direita/Pivô), a ordem sugerida de atletas e
o motivo de cada posição — recalculada toda vez que o seletor é aberto,
nunca guardada (o que FICA guardado continua a ser só a escolha final do
treinador, em `rotation_plan_stints`, inalterado).

| Campo | Tipo | Notas |
|---|---|---|
| `playerId` | `string` (uuid) | |
| `quality` | `"A" \| "B" \| "C" \| null` | Vem direto de `player_aptitudes` pra essa vaga — fator principal da ordenação. |
| `availabilityStatus` | `"apto" \| "a_retomar" \| "indisponivel"` | Vem direto de `players`. |
| `recentMinutes` | `RecentMinutes` | Contexto — nunca decide a ordem sozinho (FR-006). |
| `reason` | `string` | Frase curta em português (FR-004) — ex.: "A na vaga · a retomar, dosear entrada" ou "Sem classificação nesta vaga". |

**Ordenação** (`engine.suggestOrder`, pura): primeiro por
`availabilityStatus` (`indisponivel` sempre por último, nunca sugerido
primeiro — FR-001/FR-002), depois por `quality` (A > B > C > sem
classificação — FR-005/FR-006), `recentMinutes` nunca entra como critério
de ordenação, só compõe o `reason` exibido. O desempate exato dentro do
mesmo `quality` fica como detalhe de implementação, não uma regra de
negócio fixa (ver Assumptions do `spec.md`).
