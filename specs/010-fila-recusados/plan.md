# Implementation Plan: Lances recusados não bloqueiam a sincronização

**Branch**: `claude/fervent-fermi-q3zk57` (trabalho; nunca direto em `main`) | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

## Summary

Quando o envio conjunto da fila é recusado, o envio passa a ser feito lance a lance. Os lances
aceites saem da fila. Os recusados por um motivo do próprio lance passam para uma lista de
**recusados**, guardada por conta no aparelho; nunca são apagados e são tentados de novo com
menos frequência. Uma recusa geral (rede, sessão) interrompe o processo sem pôr nada de lado. A
app mostra quantos lances foram recusados e porquê, em português simples, e tem um botão
"Tentar outra vez". O jogo aberto nunca perde os lances recusados quando lê o servidor.

## Technical Context

- **Language/Version**: TypeScript (strict), monorepo npm existente.
- **Primary Dependencies**: Preact + supabase-js (`apps/web`). Nenhuma dependência nova.
- **Storage**: `localStorage` por conta. Chave nova `teambench.outbox.<ownerId>.recusados`. Nada
  muda no servidor: **zero migrações**, nenhuma policy (FR-011).
- **Testing**: Vitest em `apps/web/src/sync/*.test.ts`, ambiente `node`, com o `localStorage` e o
  cliente Supabase simulados já usados em `outboxTestHelpers.ts`. Sem rede (Princípio IV).
- **Target Platform**: a PWA existente (iPhone, tablet, desktop).
- **Performance Goals**: o caso normal continua a ser 1 ping + 1 upsert (FR-010). O envio lance a
  lance só acontece depois de uma recusa do lote.
- **Constraints**:
  - um item enfileirado nunca é recalculado (invariante do `outbox.ts` e guarda 0026);
  - nunca apagar um lance;
  - a fila corrompida e a quarentena mantêm o comportamento atual;
  - isolamento por `ownerId`.
- **Scale/Scope**: de dezenas a centenas de lances por envio. O envio lance a lance é sequencial
  e pára à primeira recusa geral.

## Constitution Check

- **I (dados de jogo)**: PASS.
  - Cada lance está sempre num de três sítios: servidor, fila ou recusados. A passagem para
    recusados escreve primeiro na lista nova e só depois remove da fila, por isso uma falha a
    meio deixa o lance duplicado e nunca perdido.
  - Os recusados continuam no estado local do jogo (FR-009).
  - Nada é descartado.
- **II (auth/RLS)**: PASS.
  - Sem migrações nem policies.
  - A classificação de erros é só do lado do cliente e não muda o que o servidor aceita.
  - Mexe na camada de sincronização, por isso o `code-reviewer` revê o diff antes do push
    (como na 009, T041).
- **III (escopo)**: PASS. Tudo continua por conta e por `team_id`; nenhuma suposição de clube único.
- **IV (testes)**: PASS. Testes Vitest sem rede, com um cliente simulado.
- **V (simplicidade)**: PASS. Mensagens em português simples, com motivo e número (contrato em
  [contracts/estado-sincronizacao.md](./contracts/estado-sincronizacao.md)).
- **VI (docs)**: `docs/ARCHITECTURE.md` (secção da fila) atualizado antes do push.
- **Portões**: `npm test`, typecheck dos 3 pacotes e build. A verificação no aparelho fica com o
  utilizador.

*Re-check pós-desenho*: sem violações.

## Project Structure

```text
specs/010-fila-recusados/  spec.md · plan.md · research.md · data-model.md · contracts/ · quickstart.md · tasks.md
apps/web/src/sync/
├── outbox.ts              # + recusados: peekRejected, moveToRejected, removeRejected, rejectedCount
├── rejection.ts           # NOVO: classificarRecusa(erro) → geral | alterado | sem_permissao | nao_existe | outro; textoRecusados()
├── outboxFlusher.ts       # lote → (recusado) lance a lance; retryRejected()
├── useOutboxSync.ts       # status: rejectedCount + motivos; retry dos recusados no arranque e a cada 5 min
└── *.test.ts              # testes de cada peça
apps/web/src/App.tsx, match/MatchFlow.tsx, match/Consola.tsx   # aviso de recusados + "Tentar outra vez"
apps/web/src/match/useLiveMatch.ts                             # pendentes inclui os recusados
docs/ARCHITECTURE.md
```

**Structure Decision**: sem mudança de estrutura. A lógica fica em módulos puros testáveis
(`rejection.ts`, `outbox.ts`, `outboxFlusher.ts`), como já é padrão na pasta `sync/`.

## Complexity Tracking

Sem violações a justificar.
