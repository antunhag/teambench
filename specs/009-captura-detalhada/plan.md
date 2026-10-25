# Implementation Plan: Captura detalhada de estatísticas (segunda tela de jogo ao vivo)

**Branch**: `claude/fervent-fermi-q3zk57` (trabalho; nunca direto em `main`) | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md) (revista em 2026-10-25)

**Input**: Feature specification from `/specs/009-captura-detalhada/spec.md`

**Referência de interação**: `docs/prototipos/consola-prototipo.html` (protótipo com dados fictícios; não é código a reaproveitar tal como está)

## Summary

Uma segunda tela de jogo ao vivo — a **Consola** — em paralelo com o "Jogo ao vivo", para quem regista estatísticas no iPhone ou no tablet: uma linha por jogador com a ação tocada na própria linha (densidade B por defeito), barra de equipa em cima, zona opcional com a grelha de referência do clube, remates do adversário na linha do GR, perdas/recuperações por zona, "−" por categoria, contadores por parte e Resumo rápido.

A abordagem técnica separa a entrega em **duas etapas**:

- **Etapa 1 — Consola com os eventos que já existem** (US1 + parte da US2/US5): golo, golo sofrido, cartões, faltas, atendimento, substituições, entrada em vaga, pausa, fim/início de parte; zona opcional só para o golo (já existe no evento). **Não toca no motor (`packages/engine`), na base de dados nem no "Jogo ao vivo"** — só UI nova em `apps/web`, a reaproveitar `MatchFlow`/`useMatchLock`/`useLiveMatch` tal como existem.
- **Etapa 2 — Novos tipos de evento** (resto de US2, US3, US4, US5): remate (desfecho), remates do adversário, defesa/saída do GR, transição a favor/contra, perda/recuperação por zona, goleiro-linha, **anulação**; zona opcional em todas as ações; "−" por categoria; contadores e Resumo completos; transições desperdiçadas no Resumo do jogo; exibição dos novos tipos no Resumo, Timeline e editor de registo. **Zero migrações** (ver research.md Decisão 1).

## Technical Context

**Language/Version**: TypeScript (strict), monorepo npm existente

**Primary Dependencies**: Preact 10 + Vite (`apps/web`); `packages/engine` sem dependências. Nenhuma dependência nova.

**Storage**: Supabase Postgres, tabela `match_events` reaproveitada por inteiro (coluna `type` sem CHECK; migrações 0026 e 0027 não restringem tipos) — **nenhuma migração**. Estado local em `localStorage` via `useLiveMatch` + fila `outbox` por proprietário (já existentes).

**Testing**: Vitest em `packages/engine/test/` (funções puras novas da Etapa 2) e em `apps/web/src/**/*.test.ts` (lógica pura de UI extraída, ambiente `node`); `packages/db-tests` não muda (sem SQL novo). Verificação manual no aparelho real feita pelo utilizador (CLAUDE.md; Princípio IV).

**Target Platform**: PWA web — **iPhone 16 (vertical, alvo principal; horizontal, secundário)** e **Samsung Galaxy Tab A11+** (Chrome; 800×1106 vertical, 1280×626 horizontal, CSS px medidos)

**Project Type**: Web application (monorepo `packages/engine` + `apps/web`)

**Performance Goals**: toque único sem espera de rede (registo local imediato, sincronização em segundo plano, como hoje); atualização do relógio sem re-render da lista nem deslocamento

**Constraints**: alvos ≥ 48×48 CSS px e o maior possível até 64 px sem esconder jogadores; sem scroll horizontal; sem hover; zoom não desativado; safe areas; offline; append-only (nunca apagar/alterar um evento já enfileirado — invariante do `outbox.ts` e guarda 0026); `data_entry` não pode apagar eventos (0011)

**Scale/Scope**: um jogo, um escritor de cada vez (trava `useMatchLock`); volume por jogo passa de dezenas para centenas de eventos na Etapa 2

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Princípio I (correção dos dados de jogo)** — PASS.
  - Etapa 1 só usa ações de motor já existentes e testadas.
  - Etapa 2 é só-acrescenta: o "−" regista um evento `anulacao` (nunca apaga nem altera o original); a zona é juntada **antes** de o evento entrar na fila (research.md Decisão 3), respeitando o invariante "item enfileirado nunca é recalculado" e a guarda 0026.
  - O fluxo ao vivo continua offline-first.
- **Princípio II (auth/RLS)** — PASS sem `security-auditor` obrigatório: nenhuma migração, policy ou tabela nova; a Consola usa a mesma permissão `canTrackLive` do "Jogo ao vivo". (Recomendado na mesma o `code-reviewer` na Etapa 2 por mexer na fila de sincronização.)
- **Princípio III (escopo, mono-clube)** — PASS: nada assume uma só equipa; tudo continua por `team_id`. A grelha de zonas é conceptual, não específica deste clube no código.
- **Princípio IV (testes sem dados reais)** — PASS: testes Vitest puros, sem rede; verificação em jogo de teste é manual pelo utilizador.
- **Princípio V (simplicidade)** — PASS: rótulos em português do clube ("Com finalização", "Remate deles", "Mais…"), ações num toque, sem jargão.
- **Princípio VI (documentação viva)** — PASS condicionado: `docs/ARCHITECTURE.md` atualizado com a Consola (Etapa 1) e os novos tipos/anulação (Etapa 2) antes de cada push para `main`.
- **Portões de qualidade** — aplicam-se a cada etapa: `npm test`, typecheck (`./node_modules/.bin/tsc -p <pacote> --noEmit` em engine, db-tests e apps/web), `npm run build --workspace apps/web`, verificação no aparelho real pelo utilizador, docs.
- **Fluxo de trabalho** — branch de trabalho; merge para `main` (produção) só com autorização explícita.

*Re-check pós-desenho (Phase 1)*: sem violações; a única decisão de risco (zona depois do lance) fica resolvida sem UPDATE (Decisão 3).

## Project Structure

### Documentation (this feature)

```text
specs/009-captura-detalhada/
├── spec.md              # revista 2026-10-25
├── plan.md              # este ficheiro
├── research.md          # decisões técnicas (regenerado)
├── data-model.md        # eventos/campos (regenerado)
├── quickstart.md        # validação manual por etapa (regenerado)
├── contracts/
│   └── consola-ui.md    # contrato de UI/interação da Consola
├── checklists/
└── tasks.md             # /speckit-tasks (a regenerar)
```

### Source Code (repository root)

```text
apps/web/src/match/
├── MatchHub.tsx             # Etapa 1: nova aba "Consola" (mesma condição canTrackLive)
├── MatchFlow.tsx            # Etapa 1: variante que monta Consola em vez de LiveMatch (mesma trava/useLiveMatch)
├── Consola.tsx              # NOVO (Etapa 1): tela da Consola (cabeçalho, barra de equipa, último evento, linhas, banco, doca)
├── consola/                 # NOVO
│   ├── ConsolaRow.tsx       # linha por jogador (densidade B/A; GR com remates deles na Etapa 2)
│   ├── TeamBar.tsx          # barra de equipa (contadores; "−" na Etapa 2)
│   ├── ZonePanel.tsx        # Etapa 2: zona rápida não modal (grelha de referência)
│   ├── SummarySheet.tsx     # Resumo rápido
│   ├── layout.ts            # lógica pura: modo por viewport, tamanho de botão "o maior que cabe"
│   ├── layout.test.ts       # testes (ambiente node)
│   ├── flows.ts             # lógica pura: fluxos de substituição/vaga (cancelar ≠ concluir)
│   └── flows.test.ts
├── useLiveMatch.ts          # Etapa 2: enfileiramento adiado do último evento com zona pendente (Decisão 3)
└── LiveMatch.tsx            # inalterado
apps/web/src/theme.css       # classes novas da Consola

packages/engine/src/          # só Etapa 2
├── types.ts                 # novos EventType + campos (data-model.md)
├── liveMatch.ts             # doRemate, doRemateAdv, doDefesa, doSaida, doTransicao, doPerda, doRecuperacao, doGoleiroLinha*, doAnulacao
├── annul.ts                 # NOVO: projeção que exclui eventos anulados (usada por placar, relatórios, timeline)
├── report.ts                # describeEvent dos novos tipos; contadores por parte; transicoesDesperdicadas
├── timeline.ts              # novos tipos na timeline exportável
└── goalTypes.ts             # corrigir comentário de ZONAS_GOLO (grelha de referência)
packages/engine/test/         # testes de cada função nova
apps/web/src/match/MatchEventEditor.tsx   # Etapa 2: mostrar/corrigir novos tipos e anulações
docs/ARCHITECTURE.md          # Consola + novos tipos + anulação
```

**Structure Decision**: Monorepo existente sem mudança de estrutura. A Consola é um componente irmão de `LiveMatch.tsx`, montado pelo mesmo `MatchFlow` (portanto com a mesma trava `useMatchLock` e o mesmo `useLiveMatch`), escolhido por uma aba nova em `MatchHub`. A lógica de layout e de fluxos fica em módulos puros testáveis, como já é padrão do projeto.

## Etapas e dependências

| Etapa | Entrega | Toca em | Depende de |
|---|---|---|---|
| 1 | Consola com eventos existentes (US1; golo com zona; contadores e Resumo dos tipos existentes) | só `apps/web` | — |
| 2a | Novos tipos no motor + anulação + projeção (sem UI) | `packages/engine` (+testes) | 1 (não bloqueante) |
| 2b | Zona rápida em todas as ações (enfileiramento adiado) | `useLiveMatch`, Consola | 2a |
| 2c | Remates deles, transições, perdas/recuperações, GR-linha, "−", contadores/Resumo completos | Consola | 2a |
| 2d | Exibição: Resumo do jogo, Timeline, editor de registo; transições desperdiçadas | `report.ts`, `timeline.ts`, `MatchEventEditor.tsx`, `MatchSummary.tsx` | 2a |

Cada etapa termina com os portões de qualidade e verificação do utilizador no aparelho; o merge para `main` é decidido pelo utilizador.

## Complexity Tracking

Sem violações da constituição a justificar.
