# Contratos: Funções RPC

Este projeto não tem API REST/GraphQL própria — o "contrato de interface" são as
funções `SECURITY DEFINER` do Postgres chamadas pelo cliente via
`supabase.rpc(...)`, mesmo padrão de `claim_live_match`/`release_live_match`/
`accept_invite` já existentes.

## `claim_resource_lock(p_team_id uuid, p_resource_type lock_resource_type) returns resource_locks`

Reivindica (ou confirma a posse de) uma trava de tela. Mesma semântica de
`claim_live_match`: se livre ou com heartbeat obsoleto, reivindica pra quem chamou;
se já é o dono, renova o heartbeat; se é outra conta com heartbeat ainda válido,
devolve a linha sem alterar (o chamador compara `holder_id` com o seu próprio
`auth.uid()` pra saber se ganhou ou não — mesmo padrão de `useMatchLock`).

**Chamado por**: `useResourceLock` (novo hook), no `mount` e a cada 20s (heartbeat).

**Autorização**: `authenticated`; internamente exige que o chamador seja membro da
equipa (`team_id`) — não reivindica trava de equipa à qual não pertence.

## `release_resource_lock(p_team_id uuid, p_resource_type lock_resource_type) returns void`

Liberta a trava — só tem efeito se quem chama é o `holder_id` atual (libertar a trava
de outra conta não faz nada, silenciosamente, mesmo padrão de `release_live_match`).

**Chamado por**: `useResourceLock`, no `unmount` e em `beforeunload`.

## `list_team_access_log(p_team_id uuid) returns table (...)`

Lista o histórico de acesso de uma equipa, com nomes/emails resolvidos (join interno
com `auth.users`, que o cliente não consegue ler diretamente) — mesmo padrão de
`list_team_members_with_email`.

**Retorna** (por linha): `id`, `event_type`, `role`, `target_email`, `target_name`,
`actor_email` (nullable), `created_at`.

**Autorização**: só devolve linhas quando quem chama é `team_admin` da equipa — igual
a `list_team_members_with_email`, devolve conjunto vazio (não erro) se não for.

**Chamado por**: `useTeamMembers.ts` (estendido), pra alimentar a nova secção de
histórico em `TeamMembers.tsx`.
