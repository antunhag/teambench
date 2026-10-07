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

## O que ainda não está endurecido (próximos candidatos a `security-auditor`)

- Domínio de email não verificado no Resend (ver acima) — bloqueia onboarding
  real, não é falha de isolamento de dados, mas é o item aberto mais visível hoje.
- Sem testes automatizados de RLS (os testes de `packages/engine` nunca tocam
  Supabase) — toda garantia de RLS hoje é leitura manual da policy, não
  verificação executável.
