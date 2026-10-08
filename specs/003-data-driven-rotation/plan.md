# Implementation Plan: Motor de Sugestão de Rotação Baseado em Dados

**Branch**: `003-data-driven-rotation` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-data-driven-rotation/spec.md`

## Summary

Hoje o seletor de atleta no planeador de rotação (`RotationPlanner.tsx`) é uma
lista plana, sem ordenação nenhuma, com a aptidão A/B/C só como texto de apoio.
Esta feature: (1) adiciona "estado do atleta" (Apto/A retomar/Indisponível) ao
Plantel — conceito novo, duas colunas em `players`; (2) agrega, pela primeira
vez, os minutos já calculados por jogo individual através de vários jogos
recentes (lógica pura nova em `packages/engine`, reaproveitando `replayEvents`
que já existe); (3) usa aptidão (fator principal) + estado (afasta/sinaliza) +
minutos (contexto) pra reordenar os mesmos `<select>` já existentes, com uma
explicação curta por atleta. Sem automação — a escolha final continua sempre
do treinador (FR-003).

## Technical Context

**Language/Version**: TypeScript (strict), SQL (Postgres/Supabase) — sem
dependência nova.

**Primary Dependencies**: Preact 10 + Vite 5 (`apps/web`), `@supabase/supabase-js`,
Vitest (`packages/engine`) — tudo já no stack.

**Storage**: Supabase Postgres. Duas colunas novas em `players`
(`availability_status`, `availability_note`) — tabela já existente, já tem RLS.
Nenhuma tabela nova.

**Testing**: Vitest em `packages/engine` — esta feature é, no fundo, lógica
pura nova (agregação de minutos através de jogos, cálculo de prioridade por
vaga) extraída pro motor, mesmo padrão já estabelecido (`resourceLock.ts`,
`navigation.ts`). `apps/web` continua sem testes automatizados (gap já
registado no roadmap).

**Target Platform**: Web (PWA), mesmo alvo de sempre — usada pelo treinador a
planear antes do jogo, tipicamente não em pleno pavilhão a meio do jogo.

**Project Type**: SPA + BaaS — sem mudança de categoria.

**Performance Goals**: N/A — volume real é um plantel pequeno (~20 atletas) e
poucos jogos recentes a agregar (ver Decisão 2 do `research.md` pra janela
exata); nada que justifique otimização especial.

**Constraints**: Nunca bloquear a escolha do treinador (FR-003) — a ordenação
e as explicações são só apresentação, nunca impedem escalar quem quer que
seja. O planeador manual (`RotationPlanner.tsx`) continua a funcionar
exatamente como hoje se o treinador ignorar a sugestão por completo.

**Scale/Scope**: 1 migração pequena (2 colunas em `players`, sem RLS nova — a
policy `players_update_coach` já existente já cobre). ~2 módulos novos em
`packages/engine` (+ testes). Em `apps/web`: estado do atleta exposto/editável
no Plantel (`Roster.tsx`/`usePlayers.ts`), `RotationPlanner.tsx` consome a
ordenação nova no lugar da lista plana atual.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção de dados de jogo acima de tudo)** — PASS. Não toca
  `match_events`/replay — só LÊ eventos já existentes pra agregar minutos,
  nunca escreve neles. O plano de rotação continua a ser só referência
  (inalterado, FR-003).
- **Princípio II (revisão deliberada de RLS/acesso)** — PASS, gate NÃO ativo:
  as 2 colunas novas em `players` ficam sob a policy `players_update_coach`
  já existente (`using (has_team_role(team_id, ['team_admin']))`, sem `with
  check`) — não é RLS nova, não é policy alterada, não toca `auth`/
  `team_members`/`invites`. Sem necessidade de passar pelo `security-auditor`.
- **Princípio III (escopo pragmático, mono-clube sem achatar o esquema)** —
  PASS. `availability_status`/`availability_note` ficam em `players`, já
  escopada por `team_id` — nenhum atalho de equipa única introduzido.
- **Princípio IV (testes nunca tocam produção)** — PASS. A lógica nova
  (agregação de minutos, prioridade por vaga) é pura, vai pra
  `packages/engine` com Vitest. Qualquer verificação manual no Supabase usa
  a equipa/atletas de teste já usados nas features anteriores.
- **Princípio V (simplicidade pra quem não é técnico)** — PASS, é o
  objetivo central: 3 estados simples (não um formulário de "nível de
  treino" numérico), explicação em português por atleta (FR-004), nunca um
  número de pontuação sozinho.
- **Princípio VI (documentação viva)** — GATE ATIVO. `docs/ARCHITECTURE.md`
  (seção "Planeamento de rotação e aptidão") precisa de atualização antes do
  push final — passa a descrever estado do atleta + agregação de minutos,
  não só aptidão A/B/C.

Nenhuma violação não-justificada — a tabela "Complexity Tracking" fica vazia.

**Reavaliação pós-desenho** (depois de `data-model.md`/`quickstart.md`):
nenhum gate novo surgiu. A decisão de NÃO precisar de `security-auditor`
(Princípio II) se confirma — a migração final (ver `data-model.md`) é só
`alter table players add column ... check (...)`, sem policy nova.

## Project Structure

### Documentation (this feature)

```text
specs/003-data-driven-rotation/
├── plan.md              # Este ficheiro
├── research.md           # Fase 0
├── data-model.md          # Fase 1
└── quickstart.md           # Fase 1 (sem tasks.md ainda — /speckit-tasks)
```

Sem `contracts/` — não há função RPC nova (as 2 colunas novas em `players`
são lidas/escritas pelo cliente diretamente, mesmo padrão já usado pra
`active`/`position`, sob a RLS já existente).

### Source Code (repository root)

```text
supabase/migrations/
└── 0021_player_availability.sql   # NOVO — 2 colunas em players, sem RLS nova

packages/engine/src/
├── recentMinutes.ts                # NOVO — agrega minutos por atleta através
│                                    #   de vários jogos (reaproveita replayEvents)
└── rotationSuggestion.ts            # NOVO — combina aptidão + estado + minutos
                                      #   numa ordem sugerida por vaga, com motivo
packages/engine/test/
├── recentMinutes.test.ts            # NOVO
└── rotationSuggestion.test.ts        # NOVO

apps/web/src/team/
├── usePlayers.ts                     # TOCADO — expõe availability_status/note
└── Roster.tsx                         # TOCADO — campo de estado por atleta
                                        #   (FR-008, "é informação do atleta")

apps/web/src/match/
├── useRecentMinutes.ts                 # NOVO — busca jogos recentes + eventos,
│                                        #   chama engine.aggregateRecentMinutes
└── RotationPlanner.tsx                  # TOCADO — troca a lista plana do
                                          #   <select> pela ordem sugerida +
                                          #   motivo, usa engine.suggestOrder
```

**Structure Decision**: Toda a lógica de "o que significa isto" (combinar
aptidão + estado + minutos numa ordem e num motivo) fica em
`packages/engine`, pura e testável — `apps/web` só busca os dados (estado do
Plantel, eventos dos jogos recentes) e chama o motor, mesmo padrão já
estabelecido nesta sessão (`resourceLock.ts`, `navigation.ts`). Nenhum
componente novo de UI — o `<select>` já existente em `RotationPlanner.tsx`
continua a ser o ponto de escolha, só a ordem e o texto das opções mudam.
