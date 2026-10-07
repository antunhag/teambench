# Data Model: Acesso Multiusuário Robusto

Duas tabelas novas, nenhuma mudança de forma nas existentes (só um trigger novo em
`team_members`, ver Decisão 5 do `research.md`).

## `resource_locks` (nova)

Trava genérica "uma conta, um recurso, até libertar" — cobre Plantel/Formato de
Jogo/Convites. O jogo (ao vivo + pós-jogo) continua a usar `matches.live_holder_id`
tal como está (Decisão 1), não esta tabela.

| Coluna | Tipo | Notas |
|---|---|---|
| `team_id` | `uuid` | FK pra `teams(id)`, parte da chave primária composta. |
| `resource_type` | `lock_resource_type` (enum: `roster`, `match_format`, `invites`) | Parte da chave primária composta. |
| `holder_id` | `uuid`, nullable | FK pra `auth.users(id)`. `null` = livre. |
| `heartbeat_at` | `timestamptz`, nullable | Atualizado a cada heartbeat (20s); usado pra detetar posse obsoleta (aparelho morreu, browser fechou sem avisar). |

**Chave primária**: `(team_id, resource_type)` — uma linha por (equipa, tela), nunca
mais que isso; não existe conceito de fila de espera.

**Validação**: `resource_type` restrito ao enum — não é texto livre, pra nunca
divergir do que o código realmente usa.

**Transições de estado**: Livre (`holder_id is null`) → Reivindicada (`holder_id` =
quem reivindicou, `heartbeat_at` = agora) → Libertada (volta a `null`) quando: (a) o
dono liberta explicitamente (fechar a tela), ou (b) outra conta reivindica depois do
heartbeat ficar obsoleto (mesma janela de tolerância que `claim_live_match` já usa).

## `team_access_log` (nova)

Histórico de concessão/remoção de acesso a uma equipa — só-acrescenta, nunca editável
nem apagável pelo cliente (mesmo espírito do `match_events`: histórico é histórico).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `uuid`, PK | `gen_random_uuid()`. |
| `team_id` | `uuid` | FK pra `teams(id)`. |
| `target_user_id` | `uuid` | FK pra `auth.users(id)` — de quem é o acesso concedido/removido. |
| `event_type` | `access_log_event` (enum: `granted`, `revoked`) | |
| `role` | `team_role` | O papel no momento do evento (pode ter mudado desde, por isso grava aqui, não só referencia `team_members` atual). |
| `actor_id` | `uuid`, nullable | FK pra `auth.users(id)` — quem concedeu/removeu. `null` só no caso de `granted` via aceite de convite (o próprio convidado "concede a si mesmo" ao aceitar — não há um "ator" admin nesse instante específico, quem convidou já ficou registado no convite). |
| `created_at` | `timestamptz` | `now()` por omissão. |

**Validação**: Preenchida só por trigger (Decisão 4) — nunca por insert direto do
cliente; a RLS de insert nesta tabela não concede `insert` a `authenticated` nenhum,
só ao trigger (que corre como `SECURITY DEFINER`).

**Relacionamentos**: `target_user_id`/`actor_id` apontam pra `auth.users`, não
diretamente legível pelo cliente — leitura passa por uma função `SECURITY DEFINER`
(`list_team_access_log`, ver `contracts/`), mesmo padrão já usado por
`list_team_members_with_email`.

## `team_members` (existente — só ganha um trigger, sem mudança de coluna)

Trigger novo `prevent_last_admin_removal` (`BEFORE DELETE OR UPDATE`): conta quantos
`team_admin` restariam na equipa depois da operação e bloqueia se o resultado for
zero. Cobre tanto `DELETE` (remover o membro) quanto `UPDATE` (despromover de
`team_admin` pra outro papel) — ver FR-010/FR-011/FR-012 da spec.
