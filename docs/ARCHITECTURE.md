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
  rows.ts, matchFormat.ts, goalTypes.ts, time.ts, types.ts

apps/web/src/
  auth/     # Login.tsx (link mágico + senha)
  team/     # Plantel, convites, clube/equipa, AcceptInvite
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
