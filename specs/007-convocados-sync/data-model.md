# Data Model: Robustez da seleção de convocados

Nenhuma tabela nova. Uma coluna nova (`match_formats.min_convocados`) e
quatro novos valores de `EventType`, reaproveitando `match_events` por
inteiro.

## `EventType` (packages/engine/src/types.ts) — 4 valores novos

| Valor | Payload relevante | Quando acontece |
|---|---|---|
| `convocado_add` | `playerId` | Atleta marcado como convocado — antes ou depois do apito |
| `convocado_remove` | `playerId` | Atleta desmarcado dos convocados — só antes do apito (depois do apito, só se remove por engano um que acabou de ser adicionado; nunca remove quem já esteve em quadra) |
| `titular_add` | `playerId` | Atleta marcado como titular (cinco inicial) — só antes do apito |
| `titular_remove` | `playerId` | Atleta desmarcado dos titulares — só antes do apito |

Cada evento é um `MatchEvent` normal (mesma interface, mesma tabela
`match_events`, mesma fila de sincronização) — `ms`/`min`/`sec` ficam em `0`
e `period` em `1` quando criado antes do apito (sem relógio ainda), já que
não são usados por estes tipos; `ts` (timestamp de parede) é o campo que
importa, usado no merge (ver research.md Decisão 2).

## `LiveMatchState` (packages/engine/src/liveMatch.ts) — campos existentes, agora derivados

- **`convocadoIds: string[]`** — já existe; passa a ser recalculado (não
  mutado direto) a partir de todos os eventos `convocado_add`/
  `convocado_remove` conhecidos, aplicando "o `ts` mais recente vence" por
  `playerId`.
- **`titularIds: string[]`** — já existe; mesma lógica, a partir de
  `titular_add`/`titular_remove`. Congelado assim que `state.started` vira
  `true` (nenhum evento novo destes tipos é produzido depois disso — a
  guarda de `toggleTitular` já impede).

## `match_formats` — 1 coluna nova

| Coluna | Tipo | Default | Significado |
|---|---|---|---|
| `min_convocados` | `int` | `null` | Mínimo esperado de convocados pra um jogo deste formato. `null` = sem aviso configurado (comportamento de hoje, nada muda). |

Sem CHECK constraint (um número negativo ou zero não faz sentido, mas
validar isso é responsabilidade da UI de edição do formato, não do banco —
consistente com as outras colunas numéricas desta tabela, que também não
têm CHECK).

## Relações

- `match_events.type` continua sem FK/CHECK pro valor — os 4 tipos novos são
  só mais valores de texto aceites, nenhuma migração de schema necessária
  além da coluna de `match_formats`.
- `min_convocados` não cria nenhuma relação nova — é lido por
  `PreMatch.tsx` via `format.minConvocados`, exatamente como
  `format.periodMinutes`/`format.periodCount` já são lidos hoje.
