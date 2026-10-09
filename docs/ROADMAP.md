# Roadmap do Teambench

> Fila de funcionalidades e iniciativas, não uma lista de tarefas do dia a dia.
> Para iniciativas maiores, o próximo passo formal é `/speckit-specify` (ver
> [constituição](../.specify/memory/constitution.md), Princípio III) antes de
> qualquer código — este documento só regista a intenção e a prioridade.
>
> Última revisão: 2026-10-09 (geração automática de plano de rotação).

## Agora

- **Visão de jogos entre vários escalões** — identificado 2026-10-08,
  durante o agrupamento Próximos/Anteriores do Calendário: um Admin do
  Clube que gere várias equipas não pode ficar a trocar de equipa só pra
  ver os jogos de cada uma — precisa de uma visão combinada. É a parte
  concreta e já com uso real identificado da "Hierarquia Admin do Clube"
  (abaixo) — ainda sem spec, próximo passo é `/speckit-specify`. Deve
  reaproveitar o mesmo agrupamento Próximos/Anteriores já construído por
  equipa, só juntando jogos de várias equipas na mesma lista.
- Verificar domínio de envio no Resend (resend.com/domains) — hoje bloqueia
  qualquer convite de chegar por email pra quem não é o dono da conta
  ([docs/SECURITY.md](SECURITY.md)).
- Endurecer `match_events` contra UPDATE fora do resync idempotente
  (achado da auditoria, adiado por exigir desenho cuidadoso de trigger).
- Resolver a vulnerabilidade crítica em dependências de dev (`vitest`/`vite`)
  — exige upgrade maior, avaliar com calma antes de forçar.
- **Trigger de consistência de `team_id` denormalizado** — achado do
  `security-auditor` ao revisar a migração `0022` (2026-10-09): nenhuma
  tabela que denormaliza `team_id` (`player_aptitudes`, `rotation_plan_stints`,
  `rotation_plan_weights`) valida que esse `team_id` bate com o time real do
  registo pai (`match_id`/`player_id`), nem as policies de UPDATE impedem
  reatribuir `team_id` pra outra equipa do mesmo admin (mesma classe de bug
  já corrigida pra `teams.club_id` na migração `0015`). Risco baixo hoje
  (mono-admin por equipa), mas vale uma migração dedicada com trigger
  compartilhado pras três tabelas, revisada pelo `security-auditor`.

## Feito recentemente

- **Geração automática de plano de rotação completo** (2026-10-09) — spec
  completa em [specs/004-rotation-plan-generation/spec.md](../specs/004-rotation-plan-generation/spec.md).
  Vai além da sugestão por vaga (abaixo): o treinador ajusta um peso de
  confiança (escala 1-5) por atleta e por vaga, pra um jogo específico, sem
  mexer na aptidão permanente do Plantel — cobre inclusive o caso de um
  atleta precisar jogar numa vaga diferente da sua classificação cadastrada
  nesse jogo. Com um clique, gera 3 opções de plano completo ("Turnos
  longos" / "Equilibrada" / "Mais rotativa") — mesmo tempo total por atleta
  nas 3, variando só o padrão de substituição/descanso. O treinador escolhe
  uma, que vira os turnos reais do jogo, editável depois sem nenhuma
  restrição extra. Tabela nova (`rotation_plan_weights`, migração `0022`,
  RLS nova) revisada e aprovada pelo `security-auditor` antes de aplicar —
  achou 2 gaps sistêmicos pré-existentes (ver item em "Agora"), não
  bloqueantes. Resolve de vez o antigo item de roadmap "Prioridade de uso /
  desembate na rotação" (R02). Detalhe completo em
  [docs/ARCHITECTURE.md](ARCHITECTURE.md).

- **Motor de Sugestão de Rotação Baseado em Dados** (2026-10-08) — spec
  completa em [specs/003-data-driven-rotation/spec.md](../specs/003-data-driven-rotation/spec.md).
  Entregou: estado do atleta (Apto/A retomar/Indisponível, migração `0021`,
  gerido no Plantel — FR-008); o seletor de atleta do planeador de rotação
  passou a sugerir a ordem por vaga (aptidão A/B/C como fator dominante,
  "jogam os melhores" — indisponível sempre por último, a retomar só marcado
  com ⏳ sem mudar a ordem) e mostra o motivo por extenso de cada sugestão.
  Minutos dos últimos 5 jogos terminados (`packages/engine/src/recentMinutes.ts`,
  reaproveitando `replayEvents`) entram só como contexto no motivo, nunca
  como critério de ordenação — um atleta sem histórico é ordenado só pela
  aptidão (FR-006/SC-005). "A retomar" reverte sozinho pra "apto" ao guardar
  um plano que inclui o atleta; "indisponível" só reverte quando o treinador
  marca "apto" de novo. Validado manualmente com atletas de teste (nunca o
  plantel real) contra um jogo de teste já existente. Detalhe completo em
  [docs/ARCHITECTURE.md](ARCHITECTURE.md).

- **Cara nova + correções reais de UX** (2026-10-07/08) — identidade
  visual real da Académica de Leça (preto/branco/dourado, brasão no lugar
  do emoji), trabalhada com um subagente `ui-designer` (VoltAgent) e o
  skill oficial `frontend-design` da Anthropic como referência, ambos
  agora disponíveis no projeto (`.claude/agents/`, `.claude/skills/`).
  Achados reais corrigidos no processo: combos sem tema (brancos em cima
  de fundo escuro), sobreposição de botões no telemóvel (Plantel,
  Calendário), botão "Registar com vídeo" invisível no placar, botões de
  zona do golo abaixo do alvo de toque mínimo. Consolidação do ponto de
  entrada do jogo (5 botões → 1, com abas Jogo/Rotações/Registo —
  `MatchHub.tsx`) revelou dois bugs reais de permissão/estado:
  `finish_live_match`/`start_live_match` (migrações `0019`/`0020`)
  corrigem um Lançador de dados nunca conseguir fechar um jogo, e
  `matches.status` a virar "live" só por abrir a tela (não por o jogo
  realmente ter começado). Calendário também passou a abrir direto nos
  jogos futuros (jogos anteriores escondidos atrás de um botão), em vez
  de uma lista só que cresce pra sempre. Detalhe completo em
  [docs/ARCHITECTURE.md](ARCHITECTURE.md) e [docs/SECURITY.md](SECURITY.md).

- **Navegação multi-equipa com segregação de acesso** (2026-10-07) — spec
  completa em [specs/002-multi-team-navigation/spec.md](../specs/002-multi-team-navigation/spec.md).
  Entregou: `App.tsx` deixou de ser uma página única empilhada e virou uma
  casca com navegação por abas (Calendário, Plantel, Formato de Jogo, Acesso
  à Equipa); `useUserTeams.ts` substituiu `useCurrentTeam.ts` e passou a
  carregar TODAS as equipas do utilizador, com um seletor que só aparece
  pra quem pertence a 2+; navegação escondida por completo (nunca
  desabilitada) conforme o papel na equipa selecionada
  (`packages/engine/src/navigation.ts`, `visibleNavItems`). Sem migração —
  reaproveita a RLS já existente. Detalhe completo em
  [docs/ARCHITECTURE.md](ARCHITECTURE.md).
- **Robustecer o acesso multiusuário do clube atual** (2026-10-07) — spec
  completa em [specs/001-multi-user-access/spec.md](../specs/001-multi-user-access/spec.md).
  Entregou: trava "uma conta, um recurso, até libertar" (generalização da
  trava de jogo já existente) estendida a 4 telas (jogo ao vivo, corretor
  pós-jogo, Plantel, Formato de Jogo, Convites — migrações `0016`); histórico
  de acesso (quem entrou/saiu, quando, por quem) e proteção contra uma
  equipa ficar com zero Admins (migração `0017`, 2 rondas de revisão do
  `security-auditor`, achado crítico real + 2 bugs de SQL corrigidos antes
  de aplicar); mudar o papel de alguém diretamente, sem depender de
  reconvidar (migração `0018`, follow-up pedido durante a implementação).
  Detalhe completo em [docs/SECURITY.md](SECURITY.md) e
  [docs/ARCHITECTURE.md](ARCHITECTURE.md).
- Auditoria de segurança completa do resto do repositório — **feita e
  corrigida** em 2026-10-07. Dois achados reais (exposição de convites
  pendentes a não-admins; troca indevida de clube de uma equipa),
  corrigidos e aplicados em produção via
  `supabase/migrations/0015_security_audit_fixes.sql`. Detalhe completo em
  [docs/SECURITY.md](SECURITY.md).

## A seguir

- **Cobertura de testes em `apps/web`** — hoje só `packages/engine` tem testes
  automatizados (Vitest); a interface inteira depende de verificação manual no
  navegador a cada mudança. Pelo menos os fluxos críticos (convite, registo ao
  vivo, corretor pós-jogo) merecem alguma rede de segurança automatizada.
- **Gate antes de produção** — todo push pra `main` vai direto pro ar (sem
  staging, só o próprio build como portão). Não precisa virar um pipeline
  complexo, mas vale avaliar algo leve (ex.: preview deploy, ou checklist manual
  formal) antes de mudanças de maior risco.

## Mais tarde / exploração

- **Módulo de cortes de vídeo** — importar vídeo (ex.: YouTube) + o JSON de
  eventos já exportável (`buildEventsExport`) e gerar clipes/highlights. Decisão
  já tomada: roda local/offline, nunca como serviço online, conectado a este
  repositório só pela exportação de dados — nunca embutido em `apps/web`. Falta
  decidir formato (script vs. app com interface) e então passar por
  `/speckit-specify` antes de começar.
- **Hierarquia "Admin do Clube"** — discutido 2026-10-07: um Admin do Clube
  poder gerir todas as equipas do clube (não só uma), com um Admin de Equipa
  só podendo gerir atribuições dentro da sua própria equipa. Deliberadamente
  fora do escopo de "Navegação multi-equipa" (acima) — essa spec assumiu os
  papéis atuais, só por equipa. Hoje não existe nenhum papel ao nível do
  clube (só `club_members`/admin do clube pra configurações básicas, ver
  `docs/ARCHITECTURE.md`) — precisa de `/speckit-specify` próprio quando
  entrar em foco. Nota de 2026-10-08: quando isso acontecer, uma visão
  combinada de jogos de vários escalões deve reaproveitar o mesmo
  agrupamento "Próximos/Anteriores" do Calendário por equipa (ver
  `docs/ARCHITECTURE.md`), só juntando jogos de várias equipas na mesma
  lista em vez de uma — não precisa de um desenho novo.

## Não planeado (de propósito)

- **Multi-tenant / multi-clube** — o esquema (`clubs` → `teams` → `team_members`)
  já comporta isso sem redesenho, e essa dimensão é deliberadamente preservada
  em qualquer tabela nova (constituição, Princípio III). Mas construir o
  onboarding, isolamento de UI e o resto da experiência multi-clube só entra
  quando houver um segundo clube real precisando — não antes.
- **Qualquer coisa comercial** (faturação, planos pagos) — fora de escopo
  enquanto o produto servir só este clube.
