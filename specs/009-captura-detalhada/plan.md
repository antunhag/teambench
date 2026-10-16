# Implementation Plan: Captura detalhada de estatísticas (segunda tela de jogo ao vivo)

**Branch**: `009-captura-detalhada` | **Date**: 2026-10-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-captura-detalhada/spec.md`

## Summary

Uma segunda tela de jogo ao vivo, autossuficiente, pro diretor dedicado a
registar estatísticas — mais densa que "Jogo ao vivo" (pensado pro
treinador, Princípio V), organizada em duas zonas (linhas por jogador +
painel de equipa). A abordagem técnica: **10 novos `EventType`**, todos
reaproveitando a MESMA tabela `match_events` sem nenhuma migração (a coluna
`type` nunca teve CHECK constraint — confirmado em `0001_init.sql`), a
MESMA fila de sincronização offline-safe, e o MESMO `useLiveMatch`/
`useMatchLock` que "Jogo ao vivo" já usa. A autossuficiência (apito/
substituição/pausa/fim de parte) reaproveita por inteiro a lógica já
existente em `packages/engine/src/liveMatch.ts` — só a UI é nova. O
relatório de "transições desperdiçadas" (US4) é uma função pura de filtro
sobre eventos já existentes, consumida pelo Resumo — não um dado guardado
à parte.

## Technical Context

**Language/Version**: TypeScript (strict), mesmo monorepo existente

**Primary Dependencies**: Preact 10 + Vite (`apps/web`), zero deps em
`packages/engine` — nenhuma dependência nova; o seletor de zona reaproveita
o `.zonegrid`/`.zbtn` já existente (grelha de botões, nunca um desenho
espacial do campo — essa ideia foi explorada e descartada durante o
desenho)

**Storage**: Supabase Postgres — reaproveita `match_events` por inteiro,
**zero migrações novas** (ver research.md Decisão 1)

**Testing**: Vitest (`packages/engine/test/`) para as funções puras novas
(criação dos 10 eventos, derivação automática de `tipo`, filtro de
transições desperdiçadas); verificação manual no navegador contra um jogo
de teste, em viewport tablet/landscape (forma física nova desta tela)

**Target Platform**: Web PWA — esta tela especificamente assume ecrã largo
(tablet, ou telemóvel em landscape), ao contrário do resto da app
(mobile-portrait-first); confirmado que é tablet de verdade na prática

**Project Type**: Web application — monorepo existente (`packages/engine` +
`apps/web`), sem mudança de estrutura

**Performance Goals**: Toque único pra marcar o resultado de um remate/
cartão/falta, sem espera de rede — mesma filosofia de "marcação local
instantânea, sincronização em segundo plano" já usada em todo o app

**Constraints**: Autossuficiência total (FR-005 — nunca depender de voltar
a "Jogo ao vivo" durante o jogo); zero migração de schema; reaproveitar
`useLiveMatch`/`useMatchLock` tal como existem, nunca duplicar a lógica de
motor já correta

**Scale/Scope**: Um jogo por vez, um diretor por vez (sem escritores
concorrentes — confirmado na spec). Volume de eventos por jogo sobe de
umas dezenas (hoje) pra possivelmente centenas (cada remate, perda,
recuperação, mudança de fase vira um evento) — ainda trivial pro Postgres,
mas uma mudança real de ordem de grandeza a ter em mente

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção dos dados de jogo)** — PASS: os 10 eventos novos
  são só acrescentados a `match_events`, nunca reescrevem nada; a trigger
  `match_events_update_guard` (migração 0026) já protege qualquer UPDATE
  futuro sobre eles, sem precisar de nenhum ajuste. Nenhum deles mexe em
  `onCourt`/`clockAcc`/`score` (são informativos, não alteram o estado do
  jogo), exceto os que já reaproveitam funções de motor existentes e
  corretas (substituição, pausa, fim de parte).
- **Princípio II (revisão de RLS/auth)** — PASS, e sem precisar de revisão
  do `security-auditor`: zero migração, zero tabela nova, zero policy
  nova. A nova tela usa a MESMA permissão que "Jogo ao vivo" já tem
  (`canTrackLive` — `team_admin`/`data_entry`, decisão fechada na
  clarificação da spec); os 10 tipos de evento novos passam pela MESMA
  policy de INSERT que `match_events` já tem pra qualquer `type`, sem
  nenhum CHECK a ajustar.
- **Princípio III (mono-clube)** — PASS: os eventos novos herdam `team_id`
  exatamente como qualquer `MatchEvent` já herda hoje. Nada aqui assume
  uma equipa só.
- **Princípio IV (testes nunca tocam dados reais)** — PASS: funções puras
  novas (criação de eventos, derivação de `tipo`, filtro de transições
  desperdiçadas) ganham testes Vitest sem rede; verificação manual no
  navegador usa um jogo de teste, nunca um jogo real agendado.
- **Princípio V (simplicidade pro treinador)** — PASS, e é o motivo de
  existir esta spec como uma tela SEPARADA: a densidade fica isolada numa
  tela nova, pro diretor — "Jogo ao vivo" continua exatamente como está
  hoje, sem nenhum conceito novo exposto ao treinador.
- **Princípio VI (documentação viva)** — esta mudança altera arquitetura
  (nova tela, novo bloco de `EventType`, novo padrão de "evento sem efeito
  no motor, só informativo") — `docs/ARCHITECTURE.md` precisa de
  atualização antes do push final (tarefa de Polish).

Nenhuma violação — não é necessário preencher Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/009-captura-detalhada/
├── plan.md              # Este ficheiro
├── research.md          # Fase 0 — decisões técnicas
├── data-model.md        # Fase 1 — EventType/MatchEvent novos, zero tabelas
├── quickstart.md        # Fase 1 — roteiro de validação manual
└── tasks.md             # Fase 2 (/speckit-tasks — ainda não gerado)
```

### Source Code (repository root)

```text
packages/engine/src/
├── types.ts              # EventType: +10 valores; MatchEvent: +5 campos
│                          # novos (desfecho, direcao, resultado, subtipo,
│                          # fase) — zona/tipo/playerId reaproveitados
├── liveMatch.ts           # +10 funções puras (doRemate, doPerda,
│                          # doRecuperacao, doTransicao, doDefesa, doSaida,
│                          # doFaseJogo, doGoleiroLinhaInicio/Fim,
│                          # doAcaoDefensiva) — maioria só acrescenta a
│                          # `events`, sem tocar onCourt/clockAcc/score
├── report.ts              # describeEvent: +10 casos novos (registo
│                          # cronológico); nova função pura de derivação
│                          # automática de `tipo` (org/trs/atr a partir do
│                          # contexto — FR-018); nova função de filtro
│                          # "transições desperdiçadas" (US4)
├── timeline.ts             # buildTimelineData/buildTimelineHtml: marcas/
│                          # faixas pros tipos novos, mesmo padrão de lane
│                          # já usado por golos/faltas/pausas
packages/engine/test/
├── liveMatch.test.ts       # testes das 10 funções novas
└── report.test.ts          # testes da derivação de tipo + filtro de
                            # transições desperdiçadas

apps/web/src/match/
├── MatchHub.tsx             # +1 aba ("Captura detalhada"), gated por
│                            # canTrackLive — mesmo padrão das 3 já
│                            # existentes
├── CapturaDetalhada.tsx (novo) # a tela nova: duas zonas lado a lado
│                            # (linhas por jogador + painel de equipa),
│                            # reaproveita useLiveMatch por inteiro
├── useLiveMatch.ts           # +10 funções expostas (doRemate etc.), MESMA
│                            # fila de outbox/sincronização
├── MatchEventEditor.tsx      # Registo: +10 tipos no dropdown "Tipo" +
│                            # pickers de detalhe (mesmo padrão já usado
│                            # pra pausa/atendimento)
├── MatchSummary.tsx          # Resumo: nova secção "Transições
│                            # desperdiçadas" (US4)

apps/web/src/theme.css      # classes novas pro layout de duas zonas/linhas
                            # por jogador; reaproveita .zonegrid/.zbtn tal
                            # como já existem

supabase/migrations/        # NENHUMA migração nova (ver research.md
                            # Decisão 1)

docs/
└── ARCHITECTURE.md          # atualizar: nova tela, novo bloco de
                            # EventType, padrão de evento informativo
```

**Structure Decision**: Nenhuma estrutura nova — tudo dentro do monorepo já
existente (`packages/engine` + `apps/web`), seguindo exatamente a mesma
separação já estabelecida (motor puro vs. UI/Supabase). A única novidade
estrutural é um componente de tela novo (`CapturaDetalhada.tsx`), que entra
no padrão de abas já estabelecido por `MatchHub.tsx`.

## Complexity Tracking

> Nenhuma violação do Constitution Check — secção não preenchida.
