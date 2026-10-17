# Teambench — instruções para o Claude Code

@.specify/memory/constitution.md

A constituição acima é a fonte principal das regras do projeto. Este ficheiro só
acrescenta contexto operacional; em caso de conflito, prevalece a constituição.
Regras daqui mais restritivas do que a constituição não a contradizem — apenas a
aplicam com mais cautela. Emendas à constituição: só via `/speckit-constitution`,
nunca à mão.

## Mapa do repositório

- `packages/engine/` — lógica pura do jogo (TS; sem DOM, rede ou Supabase). Testes em `test/` (Vitest).
- `packages/db-tests/` — testes de SQL das migrations com PGlite (ver "Comandos existentes").
- `apps/web/` — app Preact + Vite + PWA; cliente Supabase em `src/supabaseClient.ts`.
- `supabase/migrations/` — histórico do esquema e da RLS. O estado efetivo do serviço
  NÃO se deduz destes ficheiros.
- `tools/rotation-solver/` — ferramenta Python standalone. `buscar_dados.py` autentica-se e
  lê dados do Supabase configurado no seu `.env`; o destino efetivo não foi verificado —
  tratar como potencialmente produção.
- `specs/NNN-*/` — artefactos Spec Kit. `.specify/` e `.claude/skills/speckit-*` são geridos
  pelo Spec Kit (manifesto em `.specify/integrations/`) — não editar à mão.
- Documentação, a consultar conforme a tarefa (não importada aqui):
  `docs/ARCHITECTURE.md`, `docs/SECURITY.md` (modelo de RLS), `docs/ROADMAP.md`.

## Comandos existentes

Comando **existente** não é comando **aprovado para execução**. Estar nesta tabela não
autoriza instalar, testar, compilar, arrancar servidores nem correr ferramentas externas:
cada execução precisa de autorização explícita do utilizador para esse comando.

| Comando | Âmbito | Observações (inspeção estática) |
|---|---|---|
| `npm ci` | instala dependências pelo lockfile | usa rede (registo npm); corre install scripts (ex.: esbuild) |
| `npm test` | engine + db-tests | |
| `npm test --workspace packages/engine` | só o engine | sem imports de rede encontrados |
| `npm test --workspace packages/db-tests` | só SQL/PGlite | o teste atual usa `new PGlite()` em memória, sem rede no código, e cobre apenas a migration 0026; não garante que testes futuros sejam offline — verificar cada novo teste |
| `./node_modules/.bin/tsc -p <pacote> --noEmit` | typecheck (`packages/engine`, `packages/db-tests`, `apps/web`) | não há script; não usar `npx` (pode descarregar); `packages/engine` não inclui `test/` |
| `npm run build --workspace apps/web` | `tsc -b` + `vite build` → `apps/web/dist` | embute `VITE_*` de `apps/web/.env*` se existirem |
| `pytest tools/rotation-solver/tests` | solver Python | requer venv com `requirements.txt` (instalação usa rede); os testes não importam `buscar_dados.py` |

Não existe lint. `npm run dev`/`preview` e `python buscar_dados.py` podem comunicar com o
Supabase configurado — nunca usar como verificação automática.

## Agentes (`.claude/agents/`)

- Revisão, só leitura (Read, Glob, Grep; sem Bash): `security-auditor` (obrigatório em
  migrations/RLS/auth/`team_members`/`invites` — Princípio II), `architect-reviewer`,
  `code-reviewer`, `qa-expert`. Quando precisarem de contexto Git, a sessão principal obtém
  e fornece o diff ou os conteúdos relevantes.
- Implementação de testes: `test-automator` (só após aprovação do âmbito).
- UI: `ui-designer` (só após aprovação da direção visual) e `ui-ux-tester` (sem ambiente de
  teste aprovado, entrega apenas um plano estático).
- A sessão principal distribui o trabalho, consolida achados, resolve duplicações e
  divergências e apresenta um plano. Os agentes são invocados explicitamente; nunca se
  presume que correram.

## Fases de trabalho

1. **Analisar** — só leitura; nenhuma alteração.
2. **Implementar** — só depois de o plano ser aprovado explicitamente; na branch da sessão.
3. **Publicar** — três ações distintas, cada uma com autorização explícita para o seu âmbito:
   - commit local;
   - push para a branch de trabalho;
   - merge ou push para `main` = deploy imediato em produção (GitHub Pages), também sujeito
     aos Portões de Qualidade da constituição.

   Autorizar uma não autoriza a seguinte: push para a branch de trabalho não autoriza merge
   nem deploy.

## Proibições

- Nenhum teste ou automação — de qualquer agente, incluindo UI no navegador — contra um
  Supabase real, nem só de leitura. Registos, contas ou jogos chamados "teste" num Supabase
  real não são exceção. (A exceção do Princípio IV para verificação manual no navegador
  refere-se a verificações feitas pelo utilizador, não a testes ou automações dos agentes.)
- Não correr `buscar_dados.py`, a CLI do Supabase, nem aplicar migrations.
- Não ler `.env`, `.env.local` nem `tools/rotation-solver/.env`, nem reproduzir valores de
  segredos. Os `.env.example` podem ser lidos.

## Relato de verificações

Toda a conclusão de trabalho indica: comandos executados e resultado; verificações NÃO
executadas e porquê; o que foi apenas inspecionado estaticamente. Nunca afirmar "testes
passam" ou "build ok" sem ter executado.
