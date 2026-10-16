# Data Model: Captura detalhada de estatísticas

Nenhuma tabela nova, nenhuma migração. Dez novos valores de `EventType` e
cinco novos campos opcionais em `MatchEvent`, reaproveitando `match_events`
por inteiro (ver research.md Decisão 1).

## `EventType` (packages/engine/src/types.ts) — 10 valores novos

| Valor | Campos relevantes | O que representa |
|---|---|---|
| `remate` | `playerId`, `desfecho`, `zona?`, `tipo?` | Remate de um jogador de linha que NÃO resultou em golo (golo continua a ser o evento `golo` já existente, intacto) |
| `perda` | `playerId?` | Perda de bola — atribuição a jogador opcional |
| `recuperacao` | `playerId?` | Recuperação de bola — atribuição a jogador opcional |
| `transicao` | `direcao`, `resultado`, `transicaoNumeros` | Transição de equipa — os 3 campos são obrigatórios pra confirmar o evento; NUNCA tem `playerId` |
| `defesa` | `playerId` (guarda-redes), `zona?` | Defesa do guarda-redes com sucesso (o reverso de `golo_sofrido`) |
| `saida` | `playerId` (guarda-redes), `resultado` | Situação de 1x1 do guarda-redes |
| `goleiro_linha_inicio` | `playerId?` (guarda-redes) | Início da janela em que o GR joga como jogador de linha |
| `goleiro_linha_fim` | — | Fim dessa janela |
| `fase_jogo` | `fase` | Mudança de fase tática ativa da equipa |
| `acao_defensiva` | `playerId?`, `subtipo` | Desarme/interceção/bloqueio genérico, atribuição opcional |

Todos os tipos já existentes (`golo`, `golo_sofrido`, `cartao_amarelo`,
`cartao_vermelho`, `falta`, `falta_sofrida`, `substituicao`, `pausa`,
`fim_pausa`, `lesao_inicio`, `lesao_fim`, `kickoff`, `fim_periodo`) ficam
exatamente como estão — só `falta`/`falta_sofrida` ganham um uso novo
(opcional) do campo `zona` que já existia na interface mas nunca era
preenchido por eles.

## `MatchEvent` (packages/engine/src/types.ts) — 5 campos novos

| Campo | Tipo | Usado por |
|---|---|---|
| `desfecho` | `"defendido" \| "fora" \| "bloqueado" \| null` | `remate` |
| `direcao` | `"ofensiva" \| "defensiva" \| null` | `transicao` |
| `resultado` | `"ganha" \| "perdida" \| null` | `transicao`, `saida` (ver research.md Decisão 3 — nunca "ganho"/"perdido") |
| `subtipo` | `"desarme" \| "intercecao" \| "bloqueio" \| null` | `acao_defensiva` |
| `fase` | `"organizacao_ofensiva" \| "organizacao_defensiva" \| "transicao_ataque_defesa" \| "transicao_defesa_ataque" \| null` | `fase_jogo` |

Campos já existentes, reaproveitados sem mudança de forma (ver research.md
Decisão 2): `zona` (`remate`, `falta`, `falta_sofrida`, `defesa` — mesma
escala `ZONAS_GOLO`, 1-12), `tipo` (`remate` — mesma escala do golo:
org/trs/atr/cnt/lat/lvr/pnt/l10/gll/ppb), `transicaoNumeros` (`transicao`
— mesmos presets `TRANSICAO_NUMEROS_VANTAGEM`/
`TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM` já em `goalTypes.ts`),
`playerId` (atribuição automática nos eventos de jogador, opcional e
nunca presente em `transicao`).

## Novas funções puras (packages/engine)

| Função | Ficheiro | Propósito |
|---|---|---|
| `doRemate`, `doPerda`, `doRecuperacao`, `doTransicao`, `doDefesa`, `doSaida`, `doFaseJogo`, `doGoleiroLinhaInicio`, `doGoleiroLinhaFim`, `doAcaoDefensiva` | `liveMatch.ts` | Uma por tipo de evento novo — todas seguem o padrão já existente de `doFoul`/`doFoulSuffered` (acrescentam a `events`, sem efeito sobre `onCourt`/`clockAcc`/`score` — ver research.md Decisão 6) |
| `inferirTipoOrigem` | `report.ts` (ou ficheiro próprio) | Deriva `tipo` (org/trs/atr) a partir do evento imediatamente anterior + fase ativa — ver research.md Decisão 4 |
| `transicoesDesperdicadas` | `report.ts` | Filtra `transicao` com `direcao=ofensiva`, `resultado=perdida`, `transicaoNumeros` de vantagem real — ver research.md Decisão 8 |

`describeEvent` (`report.ts`) e `buildTimelineData`/`buildTimelineHtml`
(`timeline.ts`) ganham um caso novo por tipo de evento, seguindo o padrão
textual/visual já estabelecido pelos tipos existentes (ex. faixa/marca na
Timeline, texto no registo cronológico).

## Relações

- Nenhuma FK nova — `match_events.type`/`player_id` continuam exatamente
  como são hoje (sem CHECK, `player_id` uma FK solta e opcional pra
  `players`).
- `goleiro_linha_inicio`/`fim` e `pausa`/`fim_pausa` não têm nenhuma
  relação formal entre si no modelo — um goleiro-linha pode acontecer
  durante ou fora de uma pausa, sem restrição.
- "Transição desperdiçada" (US4) não é uma entidade persistida — é um
  resultado computado sobre `transicao` (ver Decisão 8), sem relação
  nenhuma no Supabase.
