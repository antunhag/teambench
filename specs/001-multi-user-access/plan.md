# Implementation Plan: Acesso Multiusuário Robusto

**Branch**: `001-multi-user-access` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-multi-user-access/spec.md`

## Summary

Generalizar a trava de edição que já existe pro jogo ao vivo (`matches.live_holder_id`
+ heartbeat, migração 0009, hook `useMatchLock`) pra cobrir mais 4 superfícies: o
corretor pós-jogo (reaproveitando a trava do jogo EXATAMENTE como está — descoberta
chave da pesquisa: é só um problema de não estar a ser chamada lá, não falta nada no
banco), e Plantel/Formato de Jogo/Convites (precisa de uma trava nova, mas genérica —
uma tabela/par de funções só, não três cópias). Mais um histórico de acesso
(quem entrou/saiu da equipa, quando, por quem) e uma trava de banco contra ficar sem
nenhum Admin da Equipa.

## Technical Context

**Language/Version**: TypeScript (strict), SQL (Postgres/Supabase)

**Primary Dependencies**: Preact 10 + Vite 5 (`apps/web`), `@supabase/supabase-js`,
Vitest (`packages/engine`) — sem dependências novas, tudo com o que já está no stack.

**Storage**: Supabase Postgres, com RLS — única camada de dados do projeto.

**Testing**: Vitest em `packages/engine` (lógica pura, sem rede) — hoje `apps/web` não
tem testes automatizados (gap já registado no roadmap); esta feature deve extrair pra
`packages/engine` o máximo de lógica pura possível (ex.: "esta trava está parada há
tempo demais?", formatação da mensagem de bloqueio) pra ganhar cobertura real, e
deixar em `apps/web` só o encanamento fino com o Supabase.

**Target Platform**: Web (PWA), usada em tablet/telemóvel em pavilhão.

**Project Type**: SPA + BaaS (Preact estático + Supabase) — sem servidor de aplicação
próprio; o "contrato de interface" deste projeto são as funções RPC do Postgres
chamadas pelo cliente, não uma API REST/GraphQL própria.

**Performance Goals**: N/A — volume real é de poucos utilizadores simultâneos por
equipa (ver Assumptions da spec), não é uma feature de escala.

**Constraints**: Não pode regredir a trava do jogo ao vivo já existente (risco de
regressão real, já que User Story 1 reaproveita o mesmo mecanismo). O registo de jogo
continua a ser o único fluxo com garantia offline forte — as travas novas
(Plantel/Formato/Convites) dependem de rede, como o resto da gestão de equipa já depende.

**Scale/Scope**: 1 migração nova (tabelas + funções + trigger), ~4 ficheiros de
`apps/web` tocados/novos, 1 módulo novo em `packages/engine` com testes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção de dados acima de tudo)** — PASS. A feature existe
  precisamente para isso; nenhuma mudança proposta toca na forma como `match_events`
  é gravado ou replay'd.
- **Princípio II (revisão deliberada de RLS/acesso)** — GATE ATIVO. Esta feature
  introduz tabelas e funções `SECURITY DEFINER` novas (trava genérica, histórico de
  acesso) e um trigger novo (último Admin). Antes de aplicar a migração em produção:
  passar pelo subagente `security-auditor`, mesmo padrão já usado na migração 0015.
  Não é um bloqueio ao planeamento, é um passo obrigatório antes do deploy.
- **Princípio III (escopo pragmático, mono-clube sem achatar o esquema)** — PASS. A
  trava genérica e o histórico de acesso são escopados por `team_id`, nunca assumem
  uma equipa única; nenhum atalho de clube único é introduzido.
- **Princípio IV (testes nunca tocam produção)** — PASS, desde que a lógica pura
  (staleness da trava, formatação de mensagem) vá para `packages/engine` com testes
  Vitest; qualquer verificação manual no Supabase usa dados de teste, nunca o jogo
  real do clube.
- **Princípio V (simplicidade pra quem não é técnico)** — PASS, já desenhado na spec
  (FR-004, User Story 4) — mensagens em português simples, sem jargão.
- **Princípio VI (documentação viva)** — GATE ATIVO. `docs/ARCHITECTURE.md` (nova
  tabela/trava genérica) e `docs/SECURITY.md` (novo histórico de acesso, nova
  proteção de último Admin, resultado da revisão do Princípio II) DEVEM ser
  atualizados antes do push final desta feature, não depois.

Nenhuma violação não-justificada — a tabela "Complexity Tracking" fica vazia.

**Reavaliação pós-desenho** (depois de `data-model.md`/`contracts/`): nenhum gate novo
surgiu. `resource_locks`/`team_access_log` seguem o mesmo padrão de tabelas escopadas
por `team_id` com funções `SECURITY DEFINER` já estabelecido (Princípio III); os dois
gates ativos (revisão de segurança antes de aplicar a migração 0016, e atualizar
`docs/ARCHITECTURE.md`/`docs/SECURITY.md` antes do push) continuam de pé pra fase de
implementação, não bloqueiam o planeamento.

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-user-access/
├── plan.md              # Este ficheiro
├── research.md           # Fase 0
├── data-model.md          # Fase 1
├── quickstart.md           # Fase 1
├── contracts/                # Fase 1 — assinaturas das funções RPC (não há API REST neste projeto)
└── tasks.md                   # Fase 2 (/speckit-tasks, ainda não gerado)
```

### Source Code (repository root)

```text
supabase/migrations/
├── 0016_resource_locks.sql         # NOVO — resource_locks + claim/release RPCs (só o que a US2 precisa)
└── 0017_access_log_and_last_admin.sql  # NOVO — team_access_log + triggers + trigger último Admin (só o que a US3 precisa)

packages/engine/src/
├── resourceLock.ts                 # NOVO — lógica pura: staleness, mensagens de bloqueio
└── ... (existentes, sem mudança de forma)
packages/engine/test/
└── resourceLock.test.ts            # NOVO

apps/web/src/
├── team/
│   ├── useResourceLock.ts          # NOVO — generaliza o padrão de apps/web/src/match/useMatchLock.ts
│   ├── Roster.tsx                  # TOCADO — usa useResourceLock("roster")
│   ├── MatchFormats.tsx            # TOCADO — usa useResourceLock("match_format")
│   ├── TeamMembers.tsx             # TOCADO — usa useResourceLock("invites") + histórico de acesso + proteção último Admin
│   └── useTeamMembers.ts           # TOCADO — expõe histórico de acesso
└── match/
    ├── useMatchLock.ts              # NÃO MUDA — já serve o propósito
    └── MatchEventEditor.tsx         # TOCADO — passa a chamar useMatchLock(matchId), igual ao MatchFlow.tsx
```

**Structure Decision**: Sem pacotes novos. A trava genérica fica em `apps/web/src/team/`
(não `match/`) porque as 3 superfícies que ela cobre (Plantel/Formato/Convites) vivem
lá; o corretor pós-jogo reaproveita a trava de `match/` que já existe, sem mudança
nenhuma nela própria — só um novo ponto de chamada.
