# Implementation Plan: Geração automática de plano de rotação completo

**Branch**: `004-rotation-plan-generation` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-rotation-plan-generation/spec.md`

## Summary

O treinador ajusta, pra um jogo específico, um peso por atleta e por vaga (ponto de
partida: aptidão + estado já cadastrados, mas sem alterar nada permanente no
Plantel). Com esses pesos, o sistema gera 3 opções de plano de rotação completo —
mesmo tempo total por atleta entre as opções (sem variação significativa), mas
padrões diferentes de substituição/descanso. O treinador escolhe uma, que vira o
plano salvo do jogo, editável depois exatamente como hoje.

## Technical Context

**Language/Version**: TypeScript 5 (Vite 5, Preact 10) — mesmo stack já usado no monorepo.

**Primary Dependencies**: `@teambench/engine` (lógica pura, `packages/engine`), cliente
Supabase JS (`apps/web`), Vitest para testes do motor.

**Storage**: Supabase Postgres — uma tabela nova, `rotation_plan_weights`, mesmo padrão
de `rotation_plan_stints` (migração 0012).

**Testing**: Vitest em `packages/engine/test/` — o motor de geração (peso → 3 opções de
turnos) é testado puro, sem rede, sem Supabase.

**Target Platform**: Web (navegador, mobile-first), build estático servido via GitHub Pages.

**Project Type**: Aplicação web em monorepo (`packages/engine` + `apps/web`), já existente.

**Performance Goals**: Gerar as 3 opções em menos de 1s no cliente — cálculo puro em
memória, sem chamada de rede extra além de carregar os pesos já cacheados.

**Constraints**: O motor de geração em `packages/engine` não pode importar nada de
`apps/web` nem do Supabase (regra já existente do repositório, ver
`docs/ARCHITECTURE.md`, "Decisões que não são óbvias de fora").

**Scale/Scope**: Plantel de ~20 atletas, 4 vagas de linha, até 4 partes por jogo —
escala trivial, sem necessidade de otimização de performance.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção dos dados de jogo)**: N/A — esta feature nunca lê nem
  escreve `match_events`; é planeamento pré-jogo, igual ao planeador manual já
  existente.
- **Princípio II (revisão de RLS/acesso)**: **APLICA-SE.** Ao contrário da feature
  anterior (specs/003-data-driven-rotation/, que só adicionou colunas sob uma policy
  já existente), esta feature cria uma TABELA NOVA (`rotation_plan_weights`) com
  POLICIES DE RLS NOVAS. Isso exige revisão do `security-auditor` antes de aplicar a
  migração em produção — incluído como tarefa explícita em `tasks.md` (não pode ser
  pulado desta vez).
- **Princípio III (escopo pragmático mono-clube)**: A tabela nova já nasce escopada
  por `team_id`, com RLS por equipa — mesmo padrão de `rotation_plan_stints`, nunca
  assume uma equipa só.
- **Princípio IV (testes nunca tocam produção)**: O motor de geração é testado só em
  Vitest (`packages/engine/test/`), sem rede. Validação manual no navegador usa
  atletas/jogos de teste, nunca o plantel real.
- **Princípio V (simplicidade pro treinador)**: O peso é exposto como uma escala
  discreta pequena (1 a 5 — ver `data-model.md`), não um número livre arbitrário, pra
  nunca exigir que o treinador entenda "o que significa peso 37 vs. 42". Rotulado em
  português simples (ex.: "pouca confiança" → "muita confiança"), nunca como "peso"
  técnico isolado.
- **Princípio VI (documentação viva)**: `docs/ARCHITECTURE.md` é atualizado ao final
  (Polish) — isto é uma mudança real de arquitetura (tabela nova, motor de geração
  novo), não só UI.

**Resultado**: PASS COM AÇÃO PENDENTE — Princípio II exige revisão do
`security-auditor` antes de aplicar a migração 0022 (tarefa explícita, ver `tasks.md`
quando gerado).

## Project Structure

### Documentation (this feature)

```text
specs/004-rotation-plan-generation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/engine/src/
  rotationPlan.ts          # já existente — reaproveitado (RotationStint, stintsOverlap, etc.)
  rotationSuggestion.ts     # já existente (specs/003) — reaproveitado (AptitudeQuality, AvailabilityStatus)
  rotationWeights.ts          # NOVO — peso padrão sugerido (aptidão + estado → peso 1-5)
  rotationGenerator.ts          # NOVO — gera as 3 opções de RotationStint[] a partir dos pesos

packages/engine/test/
  rotationWeights.test.ts
  rotationGenerator.test.ts

apps/web/src/match/
  useRotationWeights.ts      # NOVO — lê/escreve rotation_plan_weights pro jogo atual
  RotationPlanner.tsx          # alterado — UI de ajuste de pesos + botão "Gerar opções" + escolha entre as 3
  useRotationPlan.ts             # já existente — saveStints reaproveitado ao escolher uma opção

supabase/migrations/
  0022_rotation_plan_weights.sql   # NOVO — tabela + RLS (revisão do security-auditor obrigatória antes de aplicar)
```

**Structure Decision**: Segue exatamente o padrão já estabelecido em
specs/003-data-driven-rotation/ — lógica pura nova em `packages/engine`, hook novo em
`apps/web/src/match/` espelhando `useRotationPlan.ts`/`useRecentMinutes.ts`, UI
integrada dentro do `RotationPlanner.tsx` já existente (não uma tela nova separada).

## Complexity Tracking

Nenhuma violação da constituição a justificar — o único gate ativo (Princípio II) tem
um caminho de conformidade claro (revisão do `security-auditor` antes da migração),
não uma exceção.
