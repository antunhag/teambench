# Implementation Plan: Robustez da seleção de convocados

**Branch**: `007-convocados-sync` | **Date**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-convocados-sync/spec.md`

## Summary

A seleção de convocados/titulares hoje vive só em `localStorage`, nunca
sincronizada com o Supabase antes do apito — causa raiz confirmada de um
incidente real (treinador perdeu parte da seleção ao trocar de sessão sob
pressão de tempo, e depois não conseguiu adicionar um atleta em falta
porque a tela de jogo ao vivo não oferece essa opção). A abordagem técnica:
tratar marcações de convocado/titular como eventos de jogo de verdade (4
novos `EventType`), reaproveitando por inteiro a fila de sincronização
offline-safe (`match_events` + outbox) que já existe e já é testada em
produção — em vez de inventar uma tabela ou um mecanismo de persistência
novo. Isso resolve as User Stories 1 e 2 quase inteiramente reaproveitando
infraestrutura existente. A User Story 3 (aviso de poucos convocados)
reaproveita o Formato de Jogo já existente, ganhando uma coluna opcional e
— como efeito colateral necessário — a capacidade de EDITAR um formato já
criado, que hoje não existe.

## Technical Context

**Language/Version**: TypeScript (strict), mesmo monorepo existente

**Primary Dependencies**: Preact 10 + Vite 5 (`apps/web`), zero deps em
`packages/engine`; `@supabase/supabase-js` já em uso — nenhuma dependência
nova

**Storage**: Supabase Postgres — reaproveita `match_events` (tabela já
existente, sem CHECK em `type`) e adiciona 1 coluna nullable em
`match_formats`; nenhuma tabela nova

**Testing**: Vitest (`packages/engine/test/`) para as funções puras novas
(derivar convocados/titulares dos eventos, merge por `ts`); verificação
manual no navegador contra um jogo de teste (nunca um jogo real) pras
mudanças de UI

**Target Platform**: Web PWA, mobile-first, offline-capable (pavilhão sem
rede fiável é o caso de uso principal, não uma exceção)

**Project Type**: Web application — monorepo existente (`packages/engine` +
`apps/web`), sem mudança de estrutura

**Performance Goals**: Marcação local instantânea (igual a hoje — sem
espera de rede); merge entre aparelhos num intervalo de ~10s é aceitável
(seleção de convocados não é uma decisão de ritmo de milissegundos)

**Constraints**: Tem de continuar funcional 100% offline antes e durante o
jogo (Princípio I); nenhuma tabela nova se o reaproveitamento de
`match_events` resolver (e resolve); merge entre aparelhos tem de ser
determinístico sem trava central

**Scale/Scope**: Plantel de uma equipa (~10-25 atletas), uma equipa real
hoje (mono-clube, Princípio III) — volume de eventos extra é desprezível
(no máximo umas dezenas por jogo)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção dos dados de jogo)** — PASS, e mais que isso: esta
  mudança CORRIGE um desvio existente (convocados fora do pipeline
  event-sourced) em vez de introduzir um novo. Os 4 eventos novos são só
  acrescentados (`convocado_add`/`remove`, `titular_add`/`remove`), nunca
  reescrevem um evento já gravado; o merge por `ts` (Decisão 2) assume
  edição concorrente como normal, não como exceção, exatamente como o
  princípio exige.
- **Princípio II (revisão de RLS/auth)** — a única mudança de schema é uma
  coluna nullable em `match_formats`; não mexe em `auth`, RLS,
  `team_members`, `invites` nem policy de acesso. `match_events` já tem RLS
  por `team_id` e os eventos novos passam pelo mesmo caminho de escrita já
  existente (outbox → upsert) — nenhuma policy nova necessária. Mesmo assim,
  a migração passa por revisão antes de aplicar em produção (Portão de
  Qualidade nº 1, abaixo), por ser mudança de schema.
- **Princípio III (mono-clube, sem achatar `team_id`)** — PASS: os eventos
  novos herdam `team_id` exatamente como qualquer `MatchEvent` já herda
  hoje; `min_convocados` vive em `match_formats`, que já é `team_id`-scoped.
  Nada aqui assume uma equipa só.
- **Princípio IV (testes nunca tocam dados reais)** — PASS: funções puras
  novas (derivação/merge) ganham testes Vitest sem rede; qualquer
  verificação manual no navegador usa um jogo de teste (`teste3`/`teste4`
  ou equivalente), nunca um jogo real agendado.
- **Princípio V (simplicidade pro treinador)** — PASS: o aviso de poucos
  convocados é uma frase simples, não-bloqueante; "+ Chamar atleta" é um
  botão + seletor, mesmo padrão visual já usado nos pickers existentes de
  `LiveMatch.tsx` (ex.: escolher quem sai pra entrar). Nenhum conceito novo
  exposto ao treinador além do que já existe hoje (convocado, titular,
  formato de jogo).
- **Princípio VI (documentação viva)** — esta mudança altera arquitetura
  (estende o que "dados de jogo event-sourced" cobre, de ações em quadra
  pra também a seleção pré-jogo) — `docs/ARCHITECTURE.md` precisa de
  atualização antes do push final (tarefa de Polish).

Nenhuma violação — não é necessário preencher Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-convocados-sync/
├── plan.md              # Este ficheiro
├── research.md          # Fase 0 — 7 decisões
├── data-model.md        # Fase 1 — EventType novo, coluna nova, zero tabelas novas
├── quickstart.md         # Fase 1 — roteiro de validação manual
└── tasks.md             # Fase 2 (/speckit-tasks — ainda não gerado)
```

### Source Code (repository root)

```text
packages/engine/src/
├── types.ts              # EventType: +4 valores (convocado_add/remove, titular_add/remove)
├── liveMatch.ts           # toggleConvocado/toggleTitular passam a criar eventos via apply();
│                          # nova função pura de derivação/merge (convocados/titulares a partir de eventos)
packages/engine/test/
└── liveMatch.test.ts      # testes da derivação/merge (last-writer-wins por ts)

apps/web/src/match/
├── useLiveMatch.ts         # toggleConvocado/toggleTitular passam por apply(); novo efeito de
│                           # merge ativo (poll ~10s) enquanto !state.started
├── PreMatch.tsx             # aviso de poucos convocados (US3), comparando contra format.minConvocados
├── LiveMatch.tsx             # "+ Chamar atleta" perto do cabeçalho "Banco" (US2)

apps/web/src/team/
├── useMatchFormats.ts       # +minConvocados no MatchFormatRow/NewMatchFormat; +updateFormat()
├── MatchFormats.tsx          # campo "Mín. convocados" no form de criar + affordance de editar
│                             # um formato já existente (não existe hoje)

supabase/migrations/
└── 0025_match_format_min_convocados.sql   # ALTER TABLE match_formats ADD COLUMN min_convocados int

docs/
└── ARCHITECTURE.md          # atualizar: convocados/titulares agora event-sourced (Princípio VI)
```

**Structure Decision**: Nenhuma estrutura nova — tudo dentro do monorepo já
existente (`packages/engine` + `apps/web`), seguindo exatamente a mesma
separação já estabelecida (motor puro vs. UI/Supabase).

## Complexity Tracking

> Nenhuma violação do Constitution Check — secção não preenchida.
