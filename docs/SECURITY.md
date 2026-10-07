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
- **Dependências de desenvolvimento** (`vite`/`vitest`, nunca enviadas pro
  bundle de produção — `npm audit --omit=dev` dá 0 achados) têm 6
  vulnerabilidades conhecidas, incluindo uma crítica (RCE via poluição de
  protótipo no `tinypool`, usado pelo `vitest`), só corrigíveis com upgrade
  maior (`vite` 5→8, `vitest` 4→5) — adiado deliberadamente pra não arriscar
  quebrar a suite de testes/build sem verificação cuidadosa primeiro.
