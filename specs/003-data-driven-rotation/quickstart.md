# Quickstart: validar Motor de Sugestão de Rotação Baseado em Dados

Guia de validação de ponta a ponta — não é a lista de tarefas de
implementação (isso é o `tasks.md`, gerado por `/speckit-tasks`), é como
confirmar que cada User Story da spec funciona de verdade depois de
implementada.

## Pré-requisitos

- Migração `0021_player_availability.sql` aplicada (SQL Editor do
  Supabase, mesmo processo das migrações anteriores).
- Build local a passar: `npm test --workspace packages/engine`,
  `npx tsc --noEmit -p apps/web`.
- **Nunca testar contra o Plantel ou jogos reais do clube** (Princípio IV)
  — usar atletas e jogos de TESTE já existentes no ambiente.
- Pelo menos 2 jogos de teste já TERMINADOS (`status = 'finished'`), com
  eventos reais, pra "minutos recentes" ter algo pra agregar.

## Cenário 1 — User Story 1 (sugestão por vaga)

1. No Plantel, confirmar/ajustar a aptidão de 2-3 atletas de teste numa
   mesma vaga (ex.: dois "A" na Ala Esquerda).
2. Abrir o planeador de rotação (`RotationPlanner`) de um jogo de teste.
3. **Esperado**: ao escolher um atleta pra essa vaga, a lista já vem
   ordenada — aptidão A antes de B antes de C antes de sem classificação
   (FR-001, FR-005).
4. Marcar um dos atletas "A" como "Indisponível" no Plantel (Cenário 2
   primeiro, se ainda não existir essa marcação).
5. **Esperado**: esse atleta não aparece mais como sugestão prioritária
   nessa vaga, mesmo sendo "A" (Acceptance Scenario 1).
6. Marcar outro atleta como "A retomar".
7. **Esperado**: continua na lista (está apto a jogar), mas com uma
   indicação clara de "dosear entrada"/menos tempo de jogo (Acceptance
   Scenario 2) — nunca escondido.

## Cenário 2 — User Story 2 (registar estado no Plantel)

1. No Plantel, marcar um atleta de teste como "Indisponível" com um motivo
   (ex.: "Entorse").
2. **Esperado**: fica visível no Plantel que esse atleta está indisponível.
3. Abrir um jogo de teste diferente (não o que estava aberto antes).
4. **Esperado**: o estado "Indisponível" continua a valer, sem precisar
   remarcar (FR-007, Acceptance Scenario 1).
5. Marcar um atleta diferente como "A retomar" e guardar um plano de
   rotação que o inclua.
6. **Esperado**: depois de guardar o plano, esse atleta volta a "Apto"
   sozinho (FR-007, Decisão 1 do `research.md`) — conferir no Plantel.
7. Tentar escalar o atleta "Indisponível" mesmo assim, num turno qualquer.
8. **Esperado**: consegue — o estado nunca bloqueia (Acceptance Scenario 3).

## Cenário 3 — User Story 3 (motivo da sugestão)

1. Com pelo menos 2 jogos de teste terminados com eventos reais, abrir o
   planeador de rotação de um novo jogo de teste.
2. **Esperado**: ao ver a lista sugerida de uma vaga, cada atleta mostra
   uma frase curta em português explicando a posição (ex.: aptidão +
   estado + contexto de minutos), nunca só um número.
3. Repetir com um atleta recém-criado no Plantel (sem nenhum jogo
   registado).
4. **Esperado**: aparece ordenado só pela aptidão, nunca primeiro nem
   último só por falta de histórico (FR-006, SC-005).

## Regressão a conferir

- O planeador de rotação continua a funcionar exatamente como antes pra
  quem ignora a sugestão — escolher qualquer atleta em qualquer vaga
  continua possível e guarda normalmente em `rotation_plan_stints`.
- `npm test --workspace packages/engine` continua 100% a passar, incluindo
  os testes novos de `recentMinutes.ts`/`rotationSuggestion.ts`.
- O Resumo/Timeline de um jogo (que já usa `replayEvents`) continua a
  mostrar os minutos corretos — confirma que reaproveitar `replayEvents`
  pros jogos recentes não teve efeito colateral nele.
