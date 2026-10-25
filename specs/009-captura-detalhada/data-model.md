# Data Model: Captura detalhada de estatísticas (revisto 2026-10-25)

Nenhuma tabela nova, nenhuma migração (research.md Decisão 1). Os eventos continuam em
`match_events` (`type`, `player_id`, `payload` jsonb, tempo de jogo, `client_event_id`).

## Etapa 1 — sem alterações ao modelo

Usa só os tipos existentes em `packages/engine/src/types.ts`: `kickoff`, `pausa`, `fim_pausa`,
`fim_periodo`, `golo` (com `tipo`, `assistId`, `zona`, `transicaoNumeros`), `golo_sofrido`
(com `tipo`, `zona`), `cartao_amarelo`, `cartao_vermelho`, `falta`, `falta_sofrida`,
`lesao_inicio`, `lesao_fim`, `substituicao` (`outId`; `null` = entrada em vaga).

## Etapa 2 — novos valores de `EventType`

| Valor | `playerId` | Campos (`payload`) | Origem na UI |
|---|---|---|---|
| `remate` | jogador de linha | `desfecho`: `defendido` \| `fora` \| `bloqueado`; `zona?` | linha do jogador (golo continua a ser `golo`) |
| `remate_adv` | — (null) | `desfecho`: `fora` \| `bloqueado`; `zona?` | linha do GR "Remate deles ▸" |
| `defesa` | GR em campo | `zona?` | linha do GR "Defendido" (= remate do adversário defendido) |
| `saida` | GR em campo | `resultado`: `ganha` \| `perdida`; `zona?` | ⋯ do GR |
| `transicao` | — (nunca) | `dir`: `ofensiva` \| `defensiva`; `resultado`: `ganha` (com finalização) \| `perdida` (sem finalização); `transicaoNumeros` | barra de equipa |
| `perda` | — (null) | `zona3`: `defesa` \| `meio` \| `ataque` | bloco de perdas |
| `recuperacao` | — (null) | `zona3`: `defesa` \| `meio` \| `ataque` | bloco de recuperações |
| `goleiro_linha_inicio` | — | — | barra de equipa |
| `goleiro_linha_fim` | — | `durSec` | barra de equipa |
| `anulacao` | — | `alvoId` (= `clientEventId` do evento anulado) | "−" de uma categoria |

Campos opcionais novos em tipos existentes: `zona?` em `falta`, `falta_sofrida`,
`cartao_amarelo`, `cartao_vermelho` (campo `zona` já existe em `MatchEvent`).

## Validações

- `transicao`: `dir`, `resultado` e `transicaoNumeros` obrigatórios; `playerId` sempre null.
- `zona`: inteiro 1-12 (grelha de referência — spec, Clarifications); `zona3`: só em `perda`/`recuperacao`.
- `anulacao.alvoId` tem de referir um evento existente do mesmo jogo, de uma categoria de equipa
  (`transicao`, `golo_sofrido`, `remate_adv`, `defesa`, `perda`, `recuperacao`), ainda não anulado.
- Golo sofrido anulado deixa de contar no placar (o placar é sempre derivado dos eventos efetivos).

## Projeção de eventos efetivos

Função pura `eventosEfetivos(events)` (`packages/engine/src/annul.ts`): remove `anulacao` e os
eventos por elas anulados (uma anulação de uma anulação reativa o original). Usada por
`recomputeScoreFor`, contadores por parte, Resumo rápido, Resumo do jogo, Timeline e
`transicoesDesperdicadas`. A lista bruta continua a ser a fonte de verdade sincronizada.

## Categorias de equipa (contadores e "−")

| Categoria | Eventos efetivos que conta |
|---|---|
| Transição a favor / contra | `transicao` com `dir` ofensiva / defensiva |
| Golo sofrido | `golo_sofrido` |
| Remates deles: defendido / fora / bloqueado | `defesa` / `remate_adv` com `desfecho` |
| Perda · {defesa, meio, ataque} | `perda` com `zona3` |
| Recuperação · {defesa, meio, ataque} | `recuperacao` com `zona3` |

Contagem "parte atual · total" = eventos efetivos com `period` igual à parte atual / todos.

## Estado de UI (não persistido no servidor)

- `fluxo`: `null` \| `{pick-out, inId}` \| `{pick-in, outId}` \| `{vacancy, inId}` (research Decisão 7).
- `slots`: posição de cada linha (`(string | null)[]`, `null` = vaga), derivada de `onCourt` por
  `reconcileSlots` e guardada em `localStorage` (`teambench.consola.slots.<matchId>`); a vaga
  fica na posição de quem saiu, por isso o fluxo de vaga não precisa de guardar a posição.
- `zonaPendente`: `{clientEventId}` do último evento com envio adiado (research Decisão 3).
- `densidade`: `B` (defeito) \| `A`; `tamanhoBotao`: 48-64 px calculado.
