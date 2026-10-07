# Arquitetura do Teambench

> Este documento descreve como o sistema funciona HOJE. Não é aspiracional — se algo
> aqui ficar desatualizado depois de uma mudança, o documento é que está errado, não
> o código. Ver Princípio VI da [constituição](../.specify/memory/constitution.md)
> para a regra que obriga a manter isto sincronizado.

## O que é

App de registo de jogo de futsal em tempo real, offline-first, usada ao vivo em
quadra por treinadores — hoje serve um único clube real (Académica de Leça, Sub-15).
Nasceu como extração do motor de jogo de um app anterior de equipa única
([AAL-NEW](https://github.com/antunhag/AAL-NEW)), com a ambição original de virar um
produto multi-equipa — ver Princípio III da constituição: essa ambição não foi
abandonada, só adiada; o esquema de dados já reflete isso (clube → equipa → membro),
mesmo com um único clube em uso.

## Stack

- **Monorepo npm workspaces**: `packages/*` + `apps/*`.
- **`packages/engine`** — lógica pura de domínio (TypeScript, zero DOM, zero rede).
  Relógio de jogo, replay de eventos, resumo/exportações, timeline, plano de rotação.
  Testado com Vitest (`packages/engine/test/`) — é a camada com cobertura de testes
  automatizados real do projeto; `apps/web` não tem testes automatizados hoje.
- **`apps/web`** — Preact + Vite + TypeScript, é a única interface (SPA, PWA com
  service worker via `vite-plugin-pwa`). Sem framework de componentes pesado de
  propósito — o domínio já fica isolado em `packages/engine`.
- **Supabase** — único backend: Postgres + Auth + Row Level Security. Não existe
  nenhum servidor de aplicação próprio; toda escrita/leitura vai direto do browser
  pro Supabase via `@supabase/supabase-js`, governada por RLS (ver `docs/SECURITY.md`).
- **Deploy**: GitHub Actions (`.github/workflows/deploy.yml`) builda e publica no
  GitHub Pages a cada push em `main` — sem staging, sem ambiente de pré-produção.
  Isso é uma escolha consciente de projeto pequeno/solo, não um descuido (ver
  Princípio e Portões de Qualidade na constituição) — mas significa que todo push
  é imediatamente visível pro clube real.

## Modelo de domínio

### Hierarquia de acesso

```
clubs (Admin do Clube: acesso implícito a TODAS as equipas do clube)
  └── teams (Sub-13, Sub-15, Sub-17, ...)
        └── team_members (papel por equipa: team_admin | data_entry | viewer)
```

Um clube pode ter várias equipas (escalões); hoje só existe uma equipa real em uso,
mas a estrutura já comporta mais sem mudança de esquema — ver Princípio III.

### Navegação e seleção de equipa

`apps/web/src/App.tsx` é uma casca (`Nav` + topbar), nunca mais uma página só com
tudo empilhado. `useUserTeams.ts` (`apps/web/src/team/`) carrega TODAS as equipas
a que o utilizador pertence (não só uma — isto substituiu um `useCurrentTeam.ts`
que fazia `.limit(1)` de propósito, com um comentário já a admitir a limitação) e
gere qual está selecionada; um seletor no topbar só aparece pra quem pertence a
2+ equipas. A última equipa selecionada, e o último ecrã ativo
(`useActiveScreen.ts`), ficam em `localStorage` — por aparelho, nunca
sincronizados entre aparelhos nem com um link/URL próprio por ecrã (decisão
deliberada, ver `specs/002-multi-team-navigation/research.md`).

Quais itens de navegação aparecem é uma função pura —
`packages/engine/src/navigation.ts` (`visibleNavItems(role)`) — reavaliada sempre
que o papel do utilizador NA equipa selecionada muda (troca de equipa, ou perda
de papel a meio da sessão). Um item sem o papel mínimo necessário é removido por
completo da navegação, nunca mostrado desabilitado; isto é só apresentação — a
proteção real continua a ser a RLS do Supabase, inalterada por esta feature.
`useUserTeams.ts` também reconsulta a lista de equipas periodicamente (20s) e ao
recuperar o foco da janela, pra avisar com clareza se a equipa selecionada deixar
de estar acessível a meio da sessão (ex.: foi removido por um Admin) — sem usar
Supabase Realtime, que este projeto não usa em mais nenhum ponto.

### Registo de jogo — event-sourced

`match_events` é o coração do sistema: cada lance (substituição, golo, cartão,
falta, pausa, início/fim de parte, atendimento) é um evento imutável, nunca
reescrito — correções entram como eventos novos ou flags (`correcao`,
`aproximado`), nunca apagando o passado silenciosamente (a única exceção
controlada é a função de apagar um evento errado/duplicado, restrita a
`team_admin` — ver migração `0011`). O estado do jogo (quem está em quadra,
placar, minutos por atleta) é sempre recalculado a partir do registo cronológico
via `replayEvents` (`packages/engine/src/replay.ts`), nunca guardado como estado
mutável por si só.

Isso é o que permite o app funcionar **offline** (um aparelho sem rede continua
registando localmente; sincroniza quando a rede volta, via `apps/web/src/sync/`)
e o que torna possível reconstruir a Timeline/Resumo de forma consistente mesmo
depois de correções feitas noutro aparelho.

### Trava de edição ao vivo

Dois Lançadores de dados diferentes não podem registar o mesmo jogo ao mesmo
tempo — `matches.live_holder_id` + heartbeat (migração `0009`) trava por
UTILIZADOR (conta), não por aparelho: o mesmo utilizador pode trocar de
telemóvel a meio do jogo sem travar a si próprio. Sem rede, a trava não pode
ser verificada — o app assume posse local e só reivindica a trava quando a
rede volta (decisão consciente: priorizar conseguir registar o jogo sobre
bloquear por uma trava inconsultável em campo).

### Trava de edição nas telas de gestão

Generaliza a trava do jogo (acima) pras 3 telas de gestão que podem ter dois
Admins/Lançadores a mexer ao mesmo tempo sem perceber: Plantel, Formato de
Jogo e Convites. `resource_locks` (migração `0016`) é uma tabela genérica
chaveada por `(team_id, resource_type)`, com `claim_resource_lock`/
`release_resource_lock` (`SECURITY DEFINER`, heartbeat de 20s) — mesmo
padrão de `matches.live_holder_id`, só que parametrizado em vez de ter uma
coluna fixa por recurso. Ao contrário do jogo (onde abrir a tela já é a
intenção de editar), estas 3 telas ficam sempre visíveis no painel — só
entram em disputa pela trava quando há uma edição de facto em curso (ex.:
uma linha do Plantel aberta para editar), nunca só por ver a lista.
`apps/web/src/team/useResourceLock.ts` consome isto, com um parâmetro
`enabled` que não existe na trava do jogo, por essa razão.

### Histórico de acesso e proteção do último Admin

`team_access_log` (migração `0017`) regista automaticamente cada entrada/
saída de alguém numa equipa (`granted`/`revoked`) — nunca escrito pelo
cliente, só por triggers em `team_members` (`AFTER INSERT`/`AFTER DELETE`/
`AFTER UPDATE OF role`). Guarda um snapshot do email no momento do evento
(`target_email`/`actor_email`), não um FK obrigatório — uma conta apagada
(RGPD) não fica presa para sempre por aparecer no histórico. Só team_admin
lê (`list_team_access_log`, `SECURITY DEFINER`, mesmo padrão de
`list_team_members_with_email`).

Uma equipa nunca pode ficar com zero `team_admin` — `prevent_last_admin_removal`
(migração `0017`) bloqueia tanto `DELETE` (remover alguém) quanto
`UPDATE OF role` (despromover) quando seria o último, libertando assim que
há 2+ Admins. Cobrir `UPDATE`, não só `DELETE`, foi necessário porque
`accept_invite()` (migração `0007`) já mudava o papel de alguém via
`ON CONFLICT DO UPDATE` ao reaceitar um convite — um caminho que passava
completamente ao lado de uma proteção pensada só para `DELETE`.

Mudar o papel de alguém diretamente (migração `0018`, policy de `UPDATE` em
`team_members` restrita a team_admin da própria equipa) reaproveita esses
mesmos dois triggers sem alterá-los — ambos já disparam em qualquer
`UPDATE OF role`, não só no caminho do convite.

### Planeamento de rotação e aptidão

`rotation_plans`/`rotation_plan_stints` guardam um plano PRÉ-jogo opcional
(4 vagas fixas de linha: Fixo, Ala Esquerda, Ala Direita, Pivô — guarda-redes
nunca entra, por desenho). `player_aptitudes` classifica cada atleta
independentemente em A/B/C por vaga (não é mais uma lista ordenada única —
vários atletas podem ser "A" na mesma vaga ao mesmo tempo). Nenhum dos dois
nunca é gerado automaticamente; o treinador monta à mão.

## Estrutura de pastas

```
packages/engine/src/
  clock.ts        # relógio de jogo (tempo decorrido, pausas)
  events.ts        # criação/idempotência de eventos
  replay.ts         # reconstrói estado a partir do registo cronológico
  rotationPlan.ts    # plano de rotação + aptidão A/B/C
  timeline.ts         # export visual (HTML) + buildEventsExport (JSON p/ ferramentas externas)
  report.ts            # descrições textuais, exportação pro Excel/Sheets do clube
  navigation.ts          # itens de navegação visíveis por papel (visibleNavItems)
  resourceLock.ts          # trava genérica das telas de gestão
  rows.ts, matchFormat.ts, goalTypes.ts, time.ts, types.ts

apps/web/src/
  Nav.tsx, useActiveScreen.ts   # casca de navegação + ecrã ativo (localStorage)
  auth/     # Login.tsx (link mágico + senha)
  team/     # Plantel, convites, clube/equipa, AcceptInvite, useUserTeams (todas as equipas do utilizador)
  match/    # fluxo ao vivo, Resumo, Timeline, corretor pós-jogo, planeador de rotação
  sync/     # fila de sincronização offline → Supabase

supabase/migrations/   # histórico completo do esquema — ver docs/SECURITY.md pro resumo do modelo de RLS
```

## Decisões que não são óbvias de fora

- **Sem backend próprio, de propósito.** Supabase + RLS faz o papel de camada de
  autorização; isso simplifica o deploy (estático, GitHub Pages) ao custo de toda
  regra de acesso viver em SQL/RLS, não em código de servidor revisável como
  TypeScript. É por isso que mudanças de RLS têm barra mais alta (Princípio II).
- **`packages/engine` nunca importa nada de `apps/web` ou do Supabase.** É lógica
  pura, testável sem rede — qualquer cálculo (minutos em quadra, placar, validação
  de rotação) deve viver aqui, não espalhado pela UI.
- **O módulo de corte de vídeo (planeado, ainda não construído) fica
  deliberadamente FORA deste repositório** — roda local/offline, nunca como
  serviço online; `apps/web` só exporta os dados estruturados (`buildEventsExport`
  em `timeline.ts`) que essa ferramenta externa vai consumir.
