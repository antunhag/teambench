# Implementation Plan: Navegação Multi-Equipa com Segregação de Acesso

**Branch**: `002-multi-team-navigation` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-multi-team-navigation/spec.md`

## Summary

Hoje `App.tsx` mostra tudo numa página só, pra uma equipa só (`useCurrentTeam` faz
`.limit(1).maybeSingle()` de propósito, com um comentário já a admitir a limitação).
Esta feature: (1) separa essa página única em ecrãs distintos com uma barra de
navegação; (2) troca `useCurrentTeam` por um hook que carrega TODAS as equipas do
utilizador e permite trocar entre elas, lembrando a última escolhida; (3) filtra os
itens da navegação pelo papel do utilizador NA equipa selecionada, escondendo
completamente o que não pode usar. Tudo client-side — reutiliza inteiramente o RLS e
os papéis já existentes, sem migração nova.

## Technical Context

**Language/Version**: TypeScript (strict), sem SQL nesta feature (sem migração nova).

**Primary Dependencies**: Preact 10 + Vite 5 (`apps/web`), `@supabase/supabase-js` —
sem dependências novas. Em particular, sem biblioteca de router: a Clarificação de
FR-008 (manter o ecrã ao atualizar a página, sem precisar de link próprio por ecrã)
dispensa isso — um `activeScreen` em estado local + `localStorage` (mesmo padrão já
usado em `apps/web/src/sync/outbox.ts` e `useLiveMatch.ts` pra sobreviver a um
recarregar de página) resolve sem adicionar peso ao bundle.

**Storage**: Nenhuma mudança em Supabase/Postgres. A única mudança de acesso a dados é
a query de `team_members` deixar de ter `.limit(1)` — já coberta pela RLS existente
(um utilizador já pode ler as suas próprias linhas de `team_members`). "Última equipa
selecionada" e "último ecrã" ficam em `localStorage`, por aparelho (não sincronizado
entre aparelhos — ver Assumptions).

**Testing**: Vitest em `packages/engine` — esta feature tem lógica pura real pra
extrair: "que itens de navegação um papel pode ver" e "qual equipa deve ficar
selecionada depois de uma lista de equipas mudar" são funções puras, testáveis sem
DOM/rede, mesmo padrão de `resourceLock.ts` (feature anterior).

**Target Platform**: Web (PWA), mesmo alvo de sempre.

**Project Type**: SPA + BaaS — sem mudança de categoria.

**Performance Goals**: N/A — mesma escala de sempre (poucos utilizadores, poucas
equipas por clube).

**Constraints**: Não pode regredir nenhum fluxo já existente (jogo ao vivo, corretor
pós-jogo, sync offline) — esta feature só reorganiza a casca de navegação à volta
deles, nunca o conteúdo interno de cada ecrã. RLS continua a ser a única barreira de
acesso real (FR-006) — a navegação escondida é só apresentação.

**Scale/Scope**: 0 migrações. ~1 módulo novo em `packages/engine` (+ testes). Em
`apps/web`: 1 hook trocado (`useCurrentTeam` → `useUserTeams`), 1-2 componentes novos
(navegação + seletor de equipa), `App.tsx` reestruturado de "tudo numa página" pra
"casca + ecrã ativo", ecrãs de gestão já existentes (Roster/MatchFormats/TeamMembers)
passam a ser montados um de cada vez, não todos sempre.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção de dados de jogo acima de tudo)** — PASS. Nenhuma mudança
  toca `match_events`, replay, ou o fluxo de registo ao vivo — só a casca de
  navegação à volta deles.
- **Princípio II (revisão deliberada de RLS/acesso)** — PASS, gate NÃO ativo desta
  vez: sem migração, sem policy nova, sem função `SECURITY DEFINER` nova. A única
  mudança de query (remover `.limit(1)` em `team_members`) lê exatamente o que a RLS
  já permite hoje a um utilizador ler sobre si próprio — não é uma superfície de
  acesso nova. Sem necessidade de passar pelo `security-auditor`.
- **Princípio III (escopo pragmático, mono-clube sem achatar o esquema)** — PASS,
  é literalmente o que esta feature entrega: deixar de assumir "uma equipa só" na
  UI, usando a estrutura `clubs`/`teams`/`team_members` que já existia pra isto.
  Não introduz nenhum papel novo (ex.: "Admin do Clube" fica fora, por desenho).
- **Princípio IV (testes nunca tocam produção)** — PASS. Lógica pura (visibilidade
  de itens de navegação, seleção de equipa) vai para `packages/engine` com Vitest.
  Qualquer verificação manual contra o Supabase real usa a conta/equipa de teste já
  usada nas features anteriores, nunca dados reais do clube.
- **Princípio V (simplicidade pra quem não é técnico)** — PASS, é o objetivo central
  da spec (User Stories 1 e 3): menos rolagem, navegação só com o que cada papel
  pode usar, sem ruído de opções bloqueadas.
- **Princípio VI (documentação viva)** — GATE ATIVO. `docs/ARCHITECTURE.md` descreve
  hoje "Estrutura de pastas" e implicitamente assume uma equipa só por sessão — tem
  de ser atualizado com a nova casca de navegação/seleção de equipa antes do push
  final desta feature.

Nenhuma violação não-justificada — a tabela "Complexity Tracking" fica vazia.

**Reavaliação pós-desenho** (depois de `data-model.md`/`quickstart.md`): nenhum gate
novo surgiu. A ausência de `contracts/` nesta feature (ver Project Structure) não é
uma violação — não há nenhuma função RPC nova nem policy nova a documentar, o único
"contrato" observável é o comportamento client-side já coberto por `data-model.md` e
pelos cenários de `quickstart.md`.

## Project Structure

### Documentation (this feature)

```text
specs/002-multi-team-navigation/
├── plan.md              # Este ficheiro
├── research.md           # Fase 0
├── data-model.md          # Fase 1 — entidades client-side (sem tabela nova no Supabase)
├── quickstart.md           # Fase 1
└── tasks.md                 # Fase 2 (/speckit-tasks, ainda não gerado)
```

Sem `contracts/` nesta feature — não há função RPC nem endpoint novo; o
comportamento observável fica documentado em `data-model.md` + `quickstart.md`.

### Source Code (repository root)

```text
packages/engine/src/
├── navigation.ts                 # NOVO — lógica pura: itens de navegação visíveis por papel,
│                                  #   qual equipa deve ficar selecionada após a lista mudar
packages/engine/test/
└── navigation.test.ts            # NOVO

apps/web/src/
├── team/
│   ├── useUserTeams.ts           # NOVO — substitui useCurrentTeam.ts: carrega TODAS as
│   │                              #   equipas do utilizador, expõe seleção + troca, persiste
│   │                              #   a última equipa em localStorage
│   └── useCurrentTeam.ts         # REMOVIDO — absorvido por useUserTeams.ts
├── Nav.tsx                        # NOVO — barra de navegação: seletor de equipa (se 2+) +
│                                   #   abas de ecrã, filtradas por navigation.ts
├── useActiveScreen.ts              # NOVO — estado do ecrã ativo + persistência em
│                                   #   localStorage (sobrevive a F5, FR-008)
└── App.tsx                          # TOCADO — deixa de empilhar tudo; vira casca
                                      #   (Nav + 1 ecrã ativo de cada vez), delegando pros
                                      #   componentes já existentes (Roster, MatchFormats,
                                      #   TeamMembers, Calendar, fluxo de jogo) sem os mudar
                                      #   por dentro
```

**Structure Decision**: A lógica pura fica em `packages/engine` (mesmo padrão já
estabelecido em `resourceLock.ts`). `useCurrentTeam.ts` é substituído, não estendido,
porque o seu contrato muda de forma (de "uma equipa" pra "lista + seleção") — manter
os dois em paralelo só confundiria qual é a fonte de verdade. Nenhum dos ecrãs já
existentes (`Roster.tsx`, `MatchFormats.tsx`, `TeamMembers.tsx`, fluxo de jogo) muda
por dentro — só passam a ser montados/desmontados pela casca nova em vez de
aparecerem todos sempre juntos.
