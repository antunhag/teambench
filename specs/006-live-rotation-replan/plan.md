# Implementation Plan: Replaneamento de rotação durante o jogo

**Branch**: `006-live-rotation-replan` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-live-rotation-replan/spec.md`

## Summary

Durante um jogo ao vivo, quando um atleta escalado em turnos futuros do plano de
rotação já escolhido é marcado indisponível (ação que já existe, no Plantel — nenhuma
tela nova pra isso), o sistema avisa quais turnos futuros ficaram afetados. O
treinador pode então pedir um replaneamento: o motor rápido já existente
(`rotationGenerator.ts`) gera uma nova sugestão cobrindo só o tempo que falta do jogo
(do minuto atual até o fim), sem o atleta indisponível, nunca mexendo em turnos já
jogados. O treinador revisa e confirma antes de qualquer coisa mudar de verdade —
mesmo padrão de confirmação explícita já usado no plano pré-jogo.

## Technical Context

**Language/Version**: TypeScript 5 (Vite 5, Preact 10) — mesmo stack já usado no monorepo.

**Primary Dependencies**: `@teambench/engine` (`packages/engine`, lógica pura), cliente
Supabase JS (`apps/web`), Vitest pros testes do motor. Nenhuma dependência nova.

**Storage**: Reaproveita tabelas já existentes — `rotation_plan_stints` (migração 0012,
via `saveStints` já existente em `useRotationPlan.ts`) e `players.availability_status`
(migração 0021, já editável no Plantel). Nenhuma tabela nem coluna nova.

**Testing**: Vitest em `packages/engine/test/` — a geração com janela restrita (a
partir de um ponto no meio do jogo) é testada pura, sem rede, mesmo padrão já usado
pro gerador existente.

**Target Platform**: Web (navegador, mobile-first), build estático servido via GitHub Pages.

**Project Type**: Aplicação web em monorepo (`packages/engine` + `apps/web`), já existente.

**Performance Goals**: Sugestão de replaneamento pronta em menos de 1 minuto, sempre
(SC-005) — na prática, quase instantâneo: o motor heurístico já existente resolve um
jogo inteiro em milissegundos (medido), então gerar só a janela restante (sempre menor
ou igual ao jogo inteiro) nunca é o gargalo.

**Constraints**: O motor de geração em `packages/engine` continua sem poder importar
nada de `apps/web` nem do Supabase (regra já existente, `docs/ARCHITECTURE.md`).
Replaneamento nunca pode alterar turnos cujo intervalo já passou (FR-004) — isso é
responsabilidade de quem monta o array final antes de persistir, não do motor
isoladamente.

**Scale/Scope**: Mesma escala já suportada — plantel de ~20 atletas, 4 vagas de linha,
até 4 partes por jogo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção dos dados de jogo)**: N/A direto — esta feature nunca lê nem
  escreve `match_events` (o registo cronológico do jogo ao vivo). `rotation_plan_stints`
  já é uma tabela editável a qualquer momento, inclusive durante um jogo ao vivo, pelo
  fluxo manual já existente (`RotationPlanner.tsx`, hoje acessível na aba "Rotações"
  mesmo com o jogo em andamento) — esta feature automatiza uma edição que o treinador
  já podia fazer manualmente, não introduz uma capacidade de escrita nova sobre dado
  sensível.
- **Princípio II (revisão de RLS/acesso)**: N/A — nenhuma tabela nem policy nova;
  reaproveita exatamente o que `rotation_plan_stints`/`players` já têm, já auditado.
- **Princípio III (escopo pragmático mono-clube)**: N/A — nenhum dado novo, nenhuma
  suposição de equipa única introduzida.
- **Princípio IV (testes nunca tocam produção)**: A lógica de "gerar só a janela
  restante" e "detectar turnos futuros afetados por uma indisponibilidade" são
  funções puras, testadas em `packages/engine/test/`, sem rede. Validação manual no
  navegador usa o jogo de teste já estabelecido (`teste4`), nunca um jogo real.
- **Princípio V (simplicidade pro treinador)**: O aviso e a sugestão usam a mesma
  linguagem simples já estabelecida no planeador pré-jogo (nunca jargão tipo "janela
  de replaneamento" na UI — isso é vocabulário desta spec, não da tela). Nunca aplica
  nada sem confirmação explícita (FR-006, FR-009).
- **Princípio VI (documentação viva)**: `docs/ARCHITECTURE.md` é atualizado ao final —
  esta feature introduz uma capacidade de arquitetura nova (o plano de rotação reage a
  eventos do jogo ao vivo, não só ao pré-jogo), que hoje não está documentada nem na
  sua forma atual (o aviso "turno encerra em breve" de `useLiveMatch.ts` também não
  está em `docs/ARCHITECTURE.md` — será documentado junto, como correção do retrato
  já desatualizado).

**Resultado**: PASS sem pendência — nenhum gate exige revisão de subagente (sem
migração, sem RLS nova).

## Project Structure

### Documentation (this feature)

```text
specs/006-live-rotation-replan/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/engine/src/
  rotationGenerator.ts     # alterado — generateRotationOptions ganha um ponto de início
                             opcional (período + segundo decorrido) pra gerar só a janela
                             restante, em vez de sempre o jogo inteiro desde o minuto 0
  rotationPlan.ts          # alterado — nova função pura pra identificar quais stints
                             futuros (period/startSec a partir de um ponto no jogo)
                             envolvem um atleta específico (usada pro aviso da US1)

packages/engine/test/
  rotationGenerator.test.ts   # novos casos — geração a partir de um ponto no meio do jogo
  rotationPlan.test.ts        # novos casos — detecção de stints futuros afetados

apps/web/src/match/
  useRotationPlan.ts        # já existente — saveStints reaproveitado sem mudar
                              assinatura; quem chama monta o array completo (turnos
                              passados inalterados + novos turnos futuros)
  useLiveMatchPoint.ts      # NOVO — ponto atual do jogo (período + segundo decorrido),
                              só leitura, mesmo padrão seguro de ReadOnlyMatch.tsx (poll
                              de match_events já sincronizados). NÃO reaproveita
                              useLiveMatch.ts direto — ele só é montado por quem detém a
                              trava do jogo (useMatchLock), e RotationPlanner.tsx não é
                              gated por essa trava (ver Decisão 5, research.md)
  RotationPlanner.tsx         # alterado — fica "ciente do jogo ao vivo" quando o status
                              do jogo é "live": mostra o aviso de turnos afetados, e o
                              botão "Gerar opções" passa a gerar só a partir do momento
                              atual (não mais o jogo inteiro) nesse caso

docs/
  ARCHITECTURE.md          # atualizado — nova capacidade de replaneamento ao vivo, e
                              aproveita pra documentar o aviso "turno encerra em breve"
                              que já existia e nunca tinha sido descrito
```

**Structure Decision**: A UI vive dentro do `RotationPlanner.tsx` já existente (aba
"Rotações", já acessível durante um jogo ao vivo — confirmado que não é gated por
status do jogo), tornado "ciente" de quando o jogo está em andamento, em vez de um
componente novo dentro de `LiveMatch.tsx`. Isso reaproveita a UI de geração de opções
que o treinador já conhece (mesmos cartões "Escolher esta") e evita duplicar lógica de
exibição de plano em dois lugares. Marcar um atleta indisponível continua sendo feito
só no Plantel (`Roster.tsx`) — nenhum atalho novo é criado; o sistema só passa a REAGIR
a essa mudança quando o treinador está na aba Rotações de um jogo ao vivo.

## Complexity Tracking

Nenhuma violação da constituição a justificar — todos os gates aplicáveis passam sem
exceção (sem migração, sem RLS nova, sem tabela nova).
