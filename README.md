# Teambench

App de registo de jogos de futsal ao vivo, offline-first, para treinadores e diretores de um
clube. É uma PWA (funciona no telemóvel e no tablet, também sem rede no pavilhão) com contas por
equipa e papéis (Admin, Lançador de dados, Visualizador).

Em produção: <https://antunhag.github.io/teambench/> (cada push para `main` publica de imediato).

## O que faz

- **Jogo ao vivo** (treinador) e **Consola** (diretor dedicado às estatísticas, tema escuro, pensada
  para tablet deitado): golos, remates, faltas, cartões, substituições, pausas, transições com
  superioridade numérica, remates do adversário, perdas e recuperações, GR-linha.
- **Resumo do jogo**: minutos por atleta (com o desconto dos pedidos de tempo), estatísticas,
  transições desperdiçadas com vantagem, pausas e tempo efetivo; **Timeline** exportável.
- **Registo**: corrigir um jogo depois, sem apagar o histórico (correções explícitas).
- **Plantel, calendário, formatos de jogo e planeador de rotações** (incluindo importar um plano
  em texto).

## Estrutura

```
packages/engine/     lógica pura do jogo (TS, sem DOM nem rede) + testes Vitest
packages/db-tests/   testes de SQL das migrations em PGlite (Postgres embutido, sem rede)
apps/web/            app Preact + Vite + PWA; cliente Supabase
supabase/migrations/ esquema e RLS (aplicadas à parte; ver docs/SECURITY.md)
tools/rotation-solver/  ferramenta Python standalone de rotações
specs/               especificações Spec Kit (uma pasta por funcionalidade)
docs/                ARCHITECTURE.md, SECURITY.md, ROADMAP.md, auditorias, protótipos
```

## Desenvolvimento

```bash
npm ci
npm test                                   # engine + db-tests + apps/web
./node_modules/.bin/tsc -p packages/engine --noEmit
./node_modules/.bin/tsc -p packages/db-tests --noEmit
./node_modules/.bin/tsc -p apps/web --noEmit
npm run build --workspace apps/web
```

Os testes nunca usam rede nem um Supabase real. `npm run dev` liga-se ao Supabase configurado em
`apps/web/.env.local` (ver `apps/web/.env.example`), por isso não serve de verificação automática.

Regras do projeto: [`.specify/memory/constitution.md`](.specify/memory/constitution.md) e
[`CLAUDE.md`](CLAUDE.md). Como o sistema funciona hoje: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
modelo de acesso e RLS: [`docs/SECURITY.md`](docs/SECURITY.md).

Uma regra que vem de um caso real: dois atletas podem usar o mesmo número de camisola. A
identidade de um atleta é sempre o seu `id`, nunca o número (há um teste de regressão para isso).
