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

## `LiveMatchState` (packages/engine/src/liveMatch.ts) — 1 campo novo, 2 campos existentes agora derivados

- **`squadEvents: MatchEvent[]`** — NOVO. Eventos de escalação, separados de
  `events` de propósito (ver research.md Decisão 3, revista durante a
  implementação) — `events` continua só ações em quadra, lido direto por
  ~10 funções/telas que não esperam eventos de escalação ali.
- **`convocadoIds: string[]`** — já existia; passa a ser recalculado (não
  mutado direto) a partir de `squadEvents` (`convocado_add`/
  `convocado_remove`), aplicando "o `ts` mais recente vence" por `playerId`
  (`deriveConvocadoIds`).
- **`onCourt: string[]`** (pré-apito) — já existia; mesma lógica, a partir
  de `squadEvents` (`titular_add`/`titular_remove`, `deriveTitularIds`).
  Depois do apito, `onCourt` passa a ser gerido só por eventos reais de
  jogo (substituição, cartão vermelho) — `squadEvents` para de importar
  pra este campo a partir daí. `titularIds` continua exatamente como hoje:
  uma cópia congelada de `onCourt` tirada por `goLive()` no instante do
  apito, nunca mais tocada depois.

`SQUAD_EVENT_TYPES` (`packages/engine/src/types.ts`) — constante com os 4
valores acima, usada por qualquer consulta ao Supabase que precise excluir
eventos de escalação do que mostra como registo cronológico/timeline.

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
