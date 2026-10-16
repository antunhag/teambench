# Research: Captura detalhada de estatísticas

## Decisão 1: Zero migração de schema — `match_events.type` nunca teve CHECK constraint

**Decisão**: Os 10 tipos de evento novos (`remate`, `perda`, `recuperacao`,
`transicao`, `defesa`, `saida`, `goleiro_linha_inicio`,
`goleiro_linha_fim`, `fase_jogo`, `acao_defensiva`) são só mais valores de
`EventType` (`packages/engine/src/types.ts`), gravados na MESMA tabela
`match_events`, pela MESMA fila de sincronização offline-safe
(`apps/web/src/sync/outbox.ts`/`useOutboxSync.ts`). Nenhuma migração SQL
necessária.

**Rationale**: `match_events.type` é `text not null`, sem CHECK constraint
(confirmado em `supabase/migrations/0001_init.sql:112`) — qualquer valor
de texto já é aceite hoje. A policy de INSERT (`match_events_write_coach`,
migração 0002) e a trigger de guarda do UPDATE
(`match_events_update_guard`, migração 0026) também não filtram por
`type` — já cobrem qualquer evento novo sem ajuste nenhum. Isto já foi o
padrão usado pelos 4 tipos de evento de escalação adicionados em
specs/007-convocados-sync/ (`convocado_add`/`remove`,
`titular_add`/`remove`) — mesma técnica, reaproveitada aqui numa escala
maior.

**Alternatives considered**: Nenhuma — não há razão pra criar uma tabela
nova ou adicionar CHECK constraint quando a tabela já aceita o que
precisamos sem mudança nenhuma.

## Decisão 2: Reaproveitar campos já existentes no `MatchEvent` sempre que o conceito já existe

**Decisão**: Dos campos que os 10 tipos novos precisam, só 5 são
GENUINAMENTE novos no `MatchEvent` — os resto reaproveita o que já existe:

| Campo | Novo ou reaproveitado | Usado por |
|---|---|---|
| `zona` | **Reaproveitado** (já existe, usado por golo) | `remate`, `falta`, `falta_sofrida`, `defesa` |
| `tipo` | **Reaproveitado** (já existe, usado por golo) | `remate` (mesma escala org/trs/atr/cnt/lat/lvr/pnt/l10/gll/ppb) |
| `transicaoNumeros` | **Reaproveitado** (já existe, só usado por golo.tipo="trs" até agora) | `transicao` |
| `playerId` | **Reaproveitado** (já existe em todo `MatchEvent`) | todos, quando há atribuição (opcional nos eventos de equipa, automática nos de jogador) |
| `desfecho` | Novo | `remate` (defendido/fora/bloqueado) |
| `direcao` | Novo | `transicao` (ofensiva/defensiva) |
| `resultado` | Novo | `transicao` (ganha/perdida), `saida` (ganha/perdida — ver Decisão 3) |
| `subtipo` | Novo | `acao_defensiva` (desarme/intercecao/bloqueio) |
| `fase` | Novo | `fase_jogo` (organizacao_ofensiva/organizacao_defensiva/transicao_ataque_defesa/transicao_defesa_ataque) |

**Rationale**: Reaproveitar `zona`/`tipo`/`transicaoNumeros` em vez de
inventar campos paralelos (ex.: `remateZona` separado de `zona`) evita ter
duas representações do mesmo conceito espalhadas pelo modelo — qualquer
função que já lê `e.zona`/`e.tipo` hoje (`describeEvent`,
`buildTimelineData`) continua a funcionar pros tipos novos sem precisar
de saber de um campo "espelho".

**Alternatives considered**: Campos dedicados por tipo de evento (ex.
`remate.zonaRemate`) — rejeitado por duplicar sem necessidade; `MatchEvent`
já é uma interface só com campos opcionais partilhados entre tipos, não
uma união discriminada por tipo — seguir esse padrão existente é mais
simples do que o contrariar.

## Decisão 3: Correção de género gramatical — `resultado` é sempre "ganha"/"perdida", nunca "ganho"/"perdido"

**Decisão**: O campo `resultado` (usado por `transicao` e `saida`) usa
sempre os valores `"ganha"`/`"perdida"`, nunca `"ganho"`/"perdido"`.

**Rationale**: A proposta de indicadores original (`reports/Proposta de
indicadores — captura detalhada.md`) tinha `saida.resultado` como
`"ganho"`/`"perdido"` (concordância masculina) — mas "a saída" é um
substantivo feminino em português, igual a "a transição". Usar um valor
só (`ganha`/`perdida`) pros dois eventos, em vez de duas listas de valores
diferentes pro mesmo conceito, também simplifica qualquer UI/relatório que
precise de tratar os dois de forma parecida.

**Alternatives considered**: Manter `"ganho"`/`"perdido"` pra `saida`
(concordância com "o 1x1") — tecnicamente defensável (o evento representa
"o 1x1", substantivo masculino), mas gera dois conjuntos de valores
diferentes pro mesmo conceito binário sem nenhum benefício real; optou-se
pela consistência.

## Decisão 4: Derivação automática de `tipo` é uma função pura testável, não lógica embutida na UI

**Decisão**: Nova função pura em `packages/engine/src/report.ts` (ou
ficheiro próprio), algo como `inferirTipoOrigem(eventosAnteriores:
MatchEvent[], faseAtiva: string | null): string | null` — recebe os
eventos já registados até ao momento (ou pelo menos os últimos relevantes)
e a fase de jogo ativa, devolve `"trs"` se o evento imediatamente anterior
for uma `transicao` com `resultado="ganha"`, `"atr"` se for uma
`recuperacao`, `"org"` se a fase ativa for `organizacao_ofensiva` e nada
mais se aplicar, ou `null` se nada for dedutível (nesse caso o diretor
escolhe à mão, como já faz hoje pro golo).

**Rationale**: Isolar esta regra como função pura permite testá-la com
Vitest sem precisar simular a UI inteira (Princípio IV), e documenta a
regra num lugar só, em vez de espalhada pela tela nova. A UI (
`CapturaDetalhada.tsx`) chama esta função ao confirmar um remate/golo,
mostra o resultado de forma visível (FR-018 — nunca uma decisão silenciosa)
com opção de corrigir antes de gravar.

**Alternatives considered**: Calcular a derivação direto na UI — rejeitado
por não ser testável isoladamente e por arriscar duplicar a regra se um
dia outro ecrã precisar da mesma lógica.

## Decisão 5: Autossuficiência reaproveita `liveMatch.ts` sem alterações — só UI nova

**Decisão**: Apito inicial, substituição, pausa, fim de parte/jogo na tela
nova chamam as MESMAS funções puras já existentes e corretas —
`resumeOrStart`, `doSub`, `pause`/`endPause` (com `isTimeoutPause` já
correto — só pedido de tempo desconta minutos), `endPeriod`. Nenhuma
dessas funções muda. Só a UI que as invoca é nova — ex.: substituição
nesta tela usa um gesto de 2 toques direto nas linhas de jogador (tocar
no suplente, tocar na linha de quem sai) em vez do sheet que "Jogo ao
vivo" usa, mas chama o mesmo `live.doSub(outId, inId)` por baixo.

**Rationale**: Reescrever esta lógica seria repetir trabalho já correto e
testado (inclusive com achados reais já corrigidos nesta sessão — ver
`docs/ARCHITECTURE.md`), e arriscaria reintroduzir bugs já resolvidos.
`useLiveMatch.ts` já expõe estas ações como funções prontas pra consumir
de qualquer componente — a tela nova só é mais um consumidor.

**Alternatives considered**: Nenhuma — reescrever a lógica de motor não
tem nenhum benefício e só introduz risco.

## Decisão 6: Eventos de equipa são observacionais — nunca tocam `onCourt`/`clockAcc`/`score`

**Decisão**: `perda`, `recuperacao`, `transicao`, `fase_jogo`,
`acao_defensiva` (e `goleiro_linha_inicio`/`fim`) só acrescentam um
`MatchEvent` à lista — nenhum muda quem está em quadra, o relógio de
jogador, ou o placar. `remate`, `defesa`, `saida` também são
observacionais nesse sentido (um remate defendido não é um golo, não
mexe no placar).

**Rationale**: Isto simplifica bastante a implementação — a maioria das
10 funções novas em `liveMatch.ts` segue o mesmo padrão simples já usado
por `doFoul`/`doFoulSuffered` hoje (`{ ...state, events: [...state.events,
ev] }`, sem lógica extra), em vez de precisar de desenhar um novo efeito
sobre o estado do jogo pra cada uma.

**Alternatives considered**: Nenhuma — nenhum destes eventos tem, pela
spec, qualquer efeito declarado sobre quem está em quadra ou o placar.

## Decisão 7: Goleiro-linha é um par de eventos de estado, nunca um evento isolado nem um campo em `LiveMatchState`

**Decisão**: `goleiro_linha_inicio`/`goleiro_linha_fim` seguem a MESMA
técnica já usada por `pausa`/`fim_pausa` e `lesao_inicio`/`lesao_fim` —
dois eventos que marcam início/fim de uma janela, nunca um campo de estado
em `LiveMatchState` (que precisaria de ser reconstruído/sincronizado à
parte). Qualquer consumidor (Timeline, relatório) que precise de saber se
um evento aconteceu "durante" o goleiro-linha cruza os timestamps dos dois
eventos, mesma técnica já usada pra calcular tempo de pausa.

**Rationale**: É o mesmo padrão já estabelecido e testado nesta sessão
pro achado do atendimento na Timeline (ver `docs/ARCHITECTURE.md`,
secção sobre `onCourtTimeline`/pausas) — não precisa de nenhum conceito
novo no motor, só mais um par de tipos de evento.

**Alternatives considered**: Um campo booleano em `LiveMatchState` — 
rejeitado pelo mesmo motivo que motivou o padrão de `pausa`: um campo de
"estado atual" esquece o histórico; um par de eventos permite reconstruir
quando aconteceu cada janela, não só se está ativo agora.

## Decisão 8: Relatório de "transições desperdiçadas" é uma função pura de filtro, não um dado guardado à parte

**Decisão**: Nova função pura (`packages/engine/src/report.ts`), algo como
`transicoesDesperdicadas(events: MatchEvent[]): MatchEvent[]` — filtra
`events` por `type === "transicao" && direcao === "ofensiva" && resultado
=== "perdida"` e `transicaoNumeros` representando vantagem real (um dos
presets de `TRANSICAO_NUMEROS_VANTAGEM`, não de
`TRANSICAO_NUMEROS_IGUALDADE_OU_DESVANTAGEM`, ambos já em
`goalTypes.ts`). `MatchSummary.tsx` chama esta função sobre os eventos já
carregados (reaproveita `mergeEvents`, que já junta Supabase + local) pra
mostrar a lista — nenhuma tabela, view, ou coluna derivada nova no
Supabase.

**Rationale**: Os dados já existem assim que `transicao` é gravado
(Decisões 1-2) — "transições desperdiçadas" é só uma pergunta sobre dados
já lá, não um conceito que precise de ser persistido à parte. Mesmo
padrão já usado por outras derivações do Resumo (ex.: minutos por atleta,
recalculados via `replayEvents`, nunca guardados).

**Alternatives considered**: Guardar um campo/flag "desperdiçada" no
próprio evento `transicao` no momento de o criar — rejeitado porque o
critério (resultado=perdida + vantagem real) já é 100% derivável dos
campos existentes; guardar isso como um campo à parte seria duplicar
informação sem necessidade.

## Decisão 9 (achado, não decisão de desenho): acesso à tela nova não precisa de nenhuma mudança de RLS

**Achado**: A clarificação da spec já fechou isto (reaproveita
`canTrackLive`), mas vale confirmar o porquê: como nenhum tipo de evento
novo tem CHECK constraint a ajustar (Decisão 1) e a tela nova usa a MESMA
trava de edição (`useMatchLock`) e a MESMA policy de escrita de
`match_events` que "Jogo ao vivo" já usa, não há NENHUMA mudança de RLS,
policy, ou papel a fazer — a nova aba em `MatchHub.tsx` só precisa do
mesmo `canTrackLive` que já gate a aba "Jogo" hoje.

**Rationale**: Confirma que o Constitution Check (Princípio II) passa sem
precisar de revisão do `security-auditor` — não há nenhuma mudança de
RLS/auth/policy nesta entrega.
