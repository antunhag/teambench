# Segurança do Teambench

> Descreve o modelo de segurança/acesso como ele REALMENTE está hoje. Toda mudança
> que altera RLS, autenticação ou papéis tem de atualizar este documento antes do
> push — ver Princípio II, VI e os Portões de Qualidade na
> [constituição](../.specify/memory/constitution.md).

## Dado sensível em jogo

O clube em uso é uma equipa **Sub-15** — os atletas registados (nome, número,
estatísticas, minutos em quadra) são menores de idade. Isso não muda a arquitetura
técnica, mas é a razão de fundo pra tratar qualquer exposição de dado de atleta
(links de convite, exports, RLS) com mais cuidado do que um projeto hobby qualquer
trataria por padrão.

## Autenticação

Supabase Auth, dois métodos:
- **Link mágico / código de 6 dígitos** (`supabase.auth.signInWithOtp` +
  `verifyOtp`) — método principal, pensado pra campo (tablet partilhado do clube:
  o treinador recebe o código no telemóvel pessoal e digita no aparelho do clube
  sem abrir o email lá).
- **Password** (`signInWithPassword`) — alternativa.

`emailRedirectTo: window.location.href` no pedido de link mágico preserva
`?invite=<token>` no redirecionamento — sem isso o convite se perderia no fluxo de
login de alguém novo (ver `apps/web/src/auth/Login.tsx`).

**Limitação conhecida e ativa**: o envio de email (login e convite) depende de
Resend como SMTP custom do Supabase, e o domínio de envio ainda não foi verificado
— na prática, hoje, email só é entregue pro dono da conta Resend
(`antunhag@gmail.com`), falhando silenciosamente pra qualquer outro destinatário.
Isso bloqueia qualquer convite novo de chegar por email até o domínio ser
verificado em resend.com/domains. Não é um bug de código — não há nada a corrigir
no repositório; é configuração externa pendente.

## Papéis e hierarquia

```
club_members: Admin do Clube  → acesso implícito a TODAS as equipas do clube
team_members: team_admin | data_entry | viewer   (por equipa)
```

- **`team_admin`** ("Admin da Equipa"): gere plantel, formato de jogo, convites,
  membros, apaga eventos de jogo errados.
- **`data_entry`** ("Lançador de dados"): regista o jogo ao vivo, corrige o
  registo — não gere plantel/membros, não apaga eventos.
- **`viewer`** ("Visualizador"): só leitura.

A separação `team_admin` vs. `data_entry` foi endurecida na migração `0004` —
antes disso os dois papéis podiam escrever em tudo (plantel, formato de jogo
incluídos), o que não refletia a intenção real.

## RLS — pontos que importam

- Toda tabela de dado de equipa (`players`, `matches`, `match_events`,
  `rotation_plans`, `player_aptitudes`, etc.) é lida/escrita através de policies
  que verificam `has_team_role(team_id, [...])` — nunca confiar em filtro feito
  só no cliente.
- **`match_events` é só-acrescenta por desenho** — não havia policy de DELETE até
  a migração `0011`, que abriu uma única exceção restrita a `team_admin`, para o
  corretor pós-jogo remover um evento duplicado/corrompido de vez. `data_entry`
  nunca pode apagar.
- **Convites** (`invites`): só `team_admin` cria/revoga (`invites_insert_admin`,
  `invites_delete_admin`, migração `0007`). Quem ainda não é membro da equipa
  consegue ver o PRÓPRIO convite pendente via `invites_select_own_email`
  (`lower(email) = lower(auth.jwt() ->> 'email')`) — nunca por `team_id`, já que
  quem recebe o convite ainda não está em `team_members`.
- **Aceitar convite** é uma função `SECURITY DEFINER` única e atómica
  (`accept_invite`, migração `0007`) — valida token, expiração
  (`invite_expired`), já-aceite (`invite_already_accepted`) e que o email do
  convite bate com `auth.jwt() ->> 'email'` (`invite_email_mismatch`,
  comparação sempre via `lower()` dos dois lados) antes de inserir em
  `team_members`. `preview_invite` (migração `0008`) existe à parte, também
  `SECURITY DEFINER`, só pra mostrar o nome da equipa na tela de convite ANTES
  de aceitar, sem precisar afrouxar a policy de leitura de `teams`.

### Incidente real já corrigido (migração 0007)

A policy original de insert em `team_members` (`team_members_insert_self_or_head_coach`,
de `0002`) permitia `user_id = auth.uid()` **sem mais nenhuma condição** — ou seja,
qualquer utilizador autenticado conseguia inserir-se a si próprio em
`team_members` de QUALQUER equipa, com qualquer papel, bastando saber o UUID da
equipa. Nunca foi explorado porque nunca esteve exposto na UI, mas a policy em si
já permitia. Corrigido: auto-insert hoje só é permitido quando o utilizador é
admin do clube dono dessa equipa (criar equipa → virar automaticamente seu
`team_admin`); entrar por convite passa a ser **só** via `accept_invite()`.

**Lição que vira regra** (Princípio II da constituição): nenhuma policy de RLS
nova ou alterada é considerada pronta só porque "a migração correu sem erro" —
precisa de leitura deliberada (via subagente `security-auditor` ou equivalente)
perguntando especificamente "quem mais, além de quem eu pensei, passa nesta
condição?".

## Segredos

`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` ficam em `apps/web/.env.local`
(gitignored) localmente, e como GitHub Actions secrets em produção
(`.github/workflows/deploy.yml`). A anon key é pública por desenho do Supabase
(é enviada ao browser) — a segurança real está inteiramente nas policies de RLS,
nunca na anon key estar "escondida". Nenhuma service-role key é usada em
`apps/web` (nem deveria: isso ignoraria RLS por completo).

## Auditoria de segurança — 2026-10-07

Primeira auditoria formal do projeto (subagente `security-auditor`, verificada
manualmente linha a linha antes de qualquer correção). Dois achados reais,
corrigidos e já aplicados em produção via
`supabase/migrations/0015_security_audit_fixes.sql`:

- **`invites` expunha convites pendentes (email + token) a qualquer membro da
  equipa, não só Admin.** A policy original de SELECT (`invites_select_team`,
  migração 0002) nunca foi apertada quando o fluxo de convites "a sério"
  chegou em 0007 — ficou coexistindo com a nova `invites_select_own_email` via
  OR. `accept_invite()` continua a exigir que o email bata com quem está
  autenticado, então um token lido assim não dava pra sequestrar o convite de
  outra pessoa — mas o email/papel do convidado ficava visível pra qualquer
  Lançador de dados/Visualizador da equipa, o que é exposição a mais num
  clube de menores. Corrigido: SELECT em `invites` agora é só `team_admin`
  (+ o próprio convidado vendo o seu).
- **`teams.club_id` podia ser trocado por um `team_admin` sem ser admin do
  clube.** A policy de UPDATE em `teams` (migração 0003) não tinha `with
  check` — um `team_admin` comum conseguia mover a própria equipa pra
  qualquer clube, mesmo sem administrá-lo. Corrigido com um trigger
  (`teams_club_reassignment_guard`) que só deixa `club_id` mudar quando quem
  está a fazer o update já é admin do clube de destino — um `with check`
  simples quebraria a edição legítima de outros campos por um `team_admin`
  comum, já que RLS não compara o valor antigo com o novo.

## Acesso multiusuário robusto (migrações 0016–0018, mesmo dia)

Três migrações pequenas e independentes, cada uma revista pelo
`security-auditor` antes de aplicar (Princípio II) — ver
`specs/001-multi-user-access/` pro processo completo.

- **`resource_locks` (0016)** — generaliza a trava de edição ao vivo do jogo
  (`matches.live_holder_id`) pras telas de Plantel/Formato de Jogo/Convites,
  chave composta `(team_id, resource_type)`, `claim_resource_lock`/
  `release_resource_lock` `SECURITY DEFINER`. Revisão: sem achados.
- **`team_access_log` + proteção do último Admin (0017)** — revisão em DUAS
  rondas, não uma:
  1. 1ª ronda, achado **CRÍTICO**: a 1ª versão só cobria `DELETE` em
     `team_members`. Mas `accept_invite()` (0007) já trocava o papel de
     alguém via `insert ... on conflict (team_id, user_id) do update set
     role = excluded.role` ao reaceitar um convite — esse caminho dispara
     gatilhos de `UPDATE`, não `INSERT`/`DELETE`, passando completamente ao
     lado tanto do histórico quanto da proteção do último Admin. Um
     team_admin podia (sem querer ou não) convidar alguém que já era membro
     com um papel diferente, e aceitar esse convite despromovia em silêncio,
     até zerando os Admins, sem registo e sem bloqueio. Reescrito cobrindo
     `UPDATE OF role` também; `target_user_id`/`actor_id` trocados de FK
     obrigatória pra nullable com `on delete set null` + snapshot de email
     (`target_email`/`actor_email`), pra nunca bloquear apagar uma conta
     (RGPD) só por ela aparecer no histórico.
  2. 2ª ronda (pós-reescrita), mais 2 bugs de SQL reais, não apenas
     estilísticos: `for update` combinado com `count(*)` é sintaxe inválida
     em Postgres (teria quebrado a remoção/despromoção de QUALQUER Admin,
     não só o caso do último — corrigido separando a trava da contagem);
     e `target_email not null` podia ser violado exatamente no cenário de
     cascata de apagar conta que a própria reescrita tentava desbloquear
     (o email já não está visível na mesma transação quando o DELETE vem em
     cascata de `auth.users` — corrigido com `coalesce(..., '(conta
     removida)')`). Sem achados pendentes após a 2ª ronda.
- **Mudar papel diretamente (0018)** — follow-up pedido pelo utilizador:
  antes só dava pra mudar o papel de alguém reconvidando-o (efeito colateral
  indireto do `accept_invite()`), o que não deveria ser trivial assim.
  Adiciona uma policy de `UPDATE` em `team_members` restrita a team_admin da
  própria equipa, mais um trigger (`prevent_team_member_identity_change`)
  que impede mudar `team_id`/`user_id` via update (RLS sozinho não compara
  OLD vs NEW, mesma razão do `teams_club_reassignment_guard` acima).
  Reaproveita os 2 triggers da 0017 sem alterá-los — ambos já disparam em
  qualquer `UPDATE OF role`. Revisão: sem achados.

Validação em produção: troca de papel testada ao vivo (conta de teste,
promover/despromover e voltar), histórico gravou corretamente. Caminho de
`DELETE` (remover um não-Admin) e o sub-caso "auto-remoção sendo o único
Admin" ficaram validados só por revisão de código (o primeiro foi bloqueado
pelo classificador de permissões da sessão como alteração de recurso
partilhado; o segundo foi deliberadamente não testado ao vivo por mexer na
única conta `team_admin` real, sem forma barata de reverter se houvesse bug).

**Risco aceite, não corrigido**: apagar a conta do único `team_admin` de uma
equipa diretamente em `auth.users` (painel do Supabase/RGPD) ainda aborta
essa transação — `prevent_last_admin_removal` dispara no `DELETE` em
cascata de `team_members` como dispararia em qualquer outro. Não há hoje
nenhum fluxo de "apagar a minha conta" na UI, então isto só afetaria uma
remoção manual feita direto no painel; promover outra pessoa a Admin
primeiro resolve. Revisitar se/quando existir um fluxo de self-service de
apagar conta.

## Estado do jogo (`matches.status`) — migrações 0019–0020

Dois achados reais, cada um revisto pelo `security-auditor` antes de
aplicar (Princípio II), ver `docs/ARCHITECTURE.md` ("Ciclo de vida de
`matches.status`") pro detalhe técnico completo:

- **`finish_live_match` (0019)** — marcar um jogo como terminado exigia
  UPDATE direto em `matches`, mas `matches_update_coach` (migração 0004)
  só permite `team_admin`. Um Lançador de dados nunca conseguia fechar um
  jogo, nem pelo botão manual — a RLS bloqueava em silêncio (o botão até
  mostrava mensagem de erro, mas tentar de novo nunca resolvia, porque o
  problema era permissão, não rede). Corrigido com `SECURITY DEFINER`,
  mesmo gate de `claim_live_match`/`release_live_match`
  (`has_team_role(['team_admin', 'data_entry'])`). Revisão: sem achados.
- **`start_live_match` (0020)** — `claim_live_match` (0009) marcava
  `status = 'live'` como efeito colateral de reivindicar a trava de
  edição, ou seja, só por ABRIR a tela do jogo. Ficou visível quando
  "Planear rotações" virou uma aba dentro do `MatchHub` (antes era um
  botão próprio, sem tocar na trava): só espreitar as rotações de um jogo
  agendado já marcava "live" sem o treinador ter começado de verdade — 2
  jogos de teste reais ficaram com esse estado incorreto antes de
  percebermos. Corrigido separando as duas coisas: `claim_live_match`
  volta a só mexer na trava; `start_live_match`, função nova, mesmo
  padrão de autorização, marca `status` só a partir de `state.started`
  (motor puro, nunca só por abrir a tela). Revisão: sem achados.

## O que ainda não está endurecido (próximos candidatos a `security-auditor`)

- **`match_events` confia que o cliente só reenvia dados idênticos num
  resync** (migração 0005) — nada na RLS impede um `data_entry` de alterar
  qualquer campo de um evento histórico via UPDATE direto, o que contorna a
  restrição de DELETE (admin-only, migração 0011) por outra via. Precisa de
  um trigger que só aceite UPDATE quando os campos de jogo não mudaram —
  adiado por exigir desenho cuidadoso pra não quebrar o resync offline de
  verdade (Princípio I da constituição).
- Domínio de email não verificado no Resend (ver acima) — bloqueia onboarding
  real, não é falha de isolamento de dados, mas é o item aberto mais visível hoje.
- Sem testes automatizados de RLS (os testes de `packages/engine` nunca tocam
  Supabase) — toda garantia de RLS hoje é leitura manual da policy, não
  verificação executável.
- **Remover/despromover os 2 últimos Admins de uma equipa ao mesmo tempo**
  (duas transações simultâneas, caso raríssimo) produz um erro de deadlock
  do Postgres em vez da mensagem traduzida "é o único Admin" — a trava
  (`for update` em `prevent_last_admin_removal`, migração 0017) já garante
  que a equipa nunca fica com zero Admins nesse cenário, só com um erro
  menos amigável numa das duas transações. Não corrigido — exigiria lógica
  de retry/mensagem especial pra um caso extremamente improvável num clube
  com poucos Admins.
- **Dependências de desenvolvimento** (`vite`/`vitest`, nunca enviadas pro
  bundle de produção — `npm audit --omit=dev` dá 0 achados) têm 6
  vulnerabilidades conhecidas, incluindo uma crítica (RCE via poluição de
  protótipo no `tinypool`, usado pelo `vitest`), só corrigíveis com upgrade
  maior (`vite` 5→8, `vitest` 4→5) — adiado deliberadamente pra não arriscar
  quebrar a suite de testes/build sem verificação cuidadosa primeiro.
