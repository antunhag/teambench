-- Histórico de acesso à equipa (quem entrou/saiu, quando, por quem) e
-- proteção contra uma equipa ficar sem nenhum Admin — ver
-- specs/001-multi-user-access/spec.md (User Story 3, FR-007 a FR-012).
--
-- Reescrita após revisão do security-auditor encontrar um buraco real: a
-- primeira versão só cobria DELETE em team_members, mas accept_invite()
-- (migração 0007) usa "insert ... on conflict (team_id, user_id) do update
-- set role = excluded.role" — se um Admin convida alguém que JÁ é membro
-- (nada impede isso em createInvite) com um papel diferente, aceitar esse
-- convite entra pelo caminho de UPDATE, não INSERT, disparando gatilhos de
-- UPDATE, não os de INSERT/DELETE. A troca de papel (incluindo despromover
-- o único Admin a Visualizador) passava batida: sem registo no histórico,
-- sem a proteção do último Admin. Corrigido cobrindo também UPDATE OF role.

create type access_log_event as enum ('granted', 'revoked');

-- target_user_id/actor_id são NULLABLE com "on delete set null" (não
-- "references ... on delete no action" como o resto do projeto costuma
-- fazer, ver matches.live_holder_id na migração 0009) — aqui o impacto é
-- diferente: esta tabela cresce pra sempre (um registo por entrada/saída,
-- nunca apagado), então uma FK obrigatória bloquearia pra sempre apagar
-- qualquer conta que algum dia apareceu aqui (Supabase "delete user"/RGPD).
-- target_email/actor_email guardam o email NO MOMENTO do evento — o
-- histórico continua legível mesmo depois da conta deixar de existir, sem
-- depender de um join que quebraria nesse caso de qualquer forma.
create table team_access_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text not null,
  event_type access_log_event not null,
  role team_role not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now()
);

alter table team_access_log enable row level security;

-- Igual a invites (migração 0015): só team_admin lê o histórico — nunca
-- Lançador de dados/Visualizador (FR-009). Nenhuma policy de
-- insert/update/delete pro cliente — só os triggers abaixo escrevem aqui.
create policy team_access_log_select_admin on team_access_log for select
  using (has_team_role(team_id, array['team_admin']::team_role[]));

-- "granted" acontece via accept_invite() (migração 0007) tomando o caminho
-- de INSERT (primeira vez que esta conta entra nesta equipa). A policy de
-- insert em team_members (team_members_insert_self_or_club_admin, 0007)
-- também permite um team_admin inserir em nome de outra conta — caminho que
-- a aplicação nunca usa hoje (só CreateTeam.tsx insere, sempre a própria
-- conta) — por isso actor_id aqui é sempre null: na prática quem concede é
-- sempre o próprio convidado aceitando, nunca um admin agindo diretamente
-- neste instante (quem convidou já ficou registado no próprio convite).
create or replace function log_team_member_granted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = new.user_id;
  insert into team_access_log (team_id, target_user_id, target_email, event_type, role, actor_id, actor_email)
  values (new.team_id, new.user_id, coalesce(v_email, '(conta removida)'), 'granted', new.role, null, null);
  return new;
end;
$$;

drop trigger if exists team_members_log_granted on team_members;
create trigger team_members_log_granted
  after insert on team_members
  for each row
  execute function log_team_member_granted();

-- "revoked" acontece via DELETE direto em team_members (removeMember,
-- apps/web/src/team/useTeamMembers.ts) — a policy de delete (migração 0002,
-- team_members_delete_head_coach) só permite team_admin, então auth.uid()
-- no momento é sempre um team_admin de verdade NESSE caminho. Exceção: um
-- DELETE em cascata vindo de apagar a própria conta em auth.users (Supabase
-- "delete user"/RGPD) não passa por essa policy nem tem sessão de
-- utilizador — nesse caso auth.uid() vem null, registado como tal (sistema,
-- não um admin agindo). Ver nota sobre esse cenário também abortar a
-- transação de apagar a conta se for o único Admin, mais abaixo.
create or replace function log_team_member_revoked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  -- Se este DELETE veio em cascata de apagar a própria conta em auth.users
  -- (RGPD/"delete user"), essa linha de auth.users já não é visível aqui
  -- (mesma transação, comando já aplicado) — v_email fica null, daí o
  -- coalesce. Sem isto, a inserção violaria target_email not null e
  -- abortaria a transação de apagar a conta, pelo mesmo motivo que o FK
  -- rígido fazia antes desta reescrita.
  select email into v_email from auth.users where id = old.user_id;
  insert into team_access_log (team_id, target_user_id, target_email, event_type, role, actor_id, actor_email)
  values (old.team_id, old.user_id, coalesce(v_email, '(conta removida)'), 'revoked', old.role, auth.uid(), (select email from auth.users where id = auth.uid()));
  return old;
end;
$$;

drop trigger if exists team_members_log_revoked on team_members;
create trigger team_members_log_revoked
  after delete on team_members
  for each row
  execute function log_team_member_revoked();

-- "role trocado" acontece só via accept_invite() reaceitando um convite pra
-- uma conta já membro (caminho ON CONFLICT DO UPDATE) — nenhuma outra
-- funcionalidade no app muda role hoje. Modelado como um "revoked" do papel
-- antigo seguido de um "granted" do papel novo, reaproveitando o mesmo
-- enum/UI em vez de criar um terceiro tipo de evento só pra isto. Guarda
-- contra disparar quando o papel "novo" é igual ao antigo (accept_invite
-- sempre lista `role` no SET, mesmo reconfirmando o mesmo papel).
create or replace function log_team_member_role_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.role = old.role then
    return new;
  end if;
  select email into v_email from auth.users where id = new.user_id;
  insert into team_access_log (team_id, target_user_id, target_email, event_type, role, actor_id, actor_email)
  values (old.team_id, old.user_id, coalesce(v_email, '(conta removida)'), 'revoked', old.role, null, null);
  insert into team_access_log (team_id, target_user_id, target_email, event_type, role, actor_id, actor_email)
  values (new.team_id, new.user_id, coalesce(v_email, '(conta removida)'), 'granted', new.role, null, null);
  return new;
end;
$$;

drop trigger if exists team_members_log_role_changed on team_members;
create trigger team_members_log_role_changed
  after update of role on team_members
  for each row
  execute function log_team_member_role_changed();

-- Proteção do último Admin (FR-010/FR-011/FR-012) — cobre DELETE (remover
-- alguém) E UPDATE OF role (despromover, incluindo via accept_invite — ver
-- nota no topo do ficheiro). Usa "for update" na contagem pra travar as
-- linhas de team_admin da equipa enquanto conta — sem isto, duas remoções
-- simultâneas dos dois últimos Admins podiam cada uma ver a outra linha
-- ainda presente no seu próprio snapshot e passar as duas, zerando os
-- Admins (condição de corrida encontrada na revisão).
--
-- Nota aceite, não corrigida aqui: um DELETE em cascata vindo de apagar a
-- conta em auth.users do único Admin de uma equipa também dispara este
-- trigger e aborta essa transação de apagar a conta — não há hoje nenhum
-- fluxo de "apagar a minha conta" no app, então isto só afetaria uma
-- remoção manual feita direto no painel do Supabase; nesse caso, promover
-- outra pessoa a Admin primeiro resolve.
create or replace function prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins int;
  was_admin boolean;
  still_admin boolean;
begin
  was_admin := (old.role = 'team_admin');
  still_admin := (tg_op = 'UPDATE' and new.role = 'team_admin');

  if was_admin and not still_admin then
    -- "for update" não pode ir junto de count(*) (agregado + lock de linha
    -- não é sintaxe válida em Postgres) — trava as linhas primeiro, com
    -- select separado, depois conta. A trava em si é o que fecha a corrida:
    -- duas remoções simultâneas dos 2 últimos Admins vão cada uma tentar
    -- travar a linha do OUTRO Admin (que a outra transação já travou só
    -- por ser alvo do seu próprio DELETE) — Postgres detecta esse ciclo e
    -- aborta uma das duas transações (erro de deadlock, não a mensagem
    -- "last_admin"), o que já garante que a equipa nunca fica com zero
    -- Admins, só com um erro menos amigável nesse cenário raríssimo.
    perform 1 from team_members
      where team_id = old.team_id and role = 'team_admin' and id <> old.id
      for update;

    select count(*) into remaining_admins
    from team_members
    where team_id = old.team_id and role = 'team_admin' and id <> old.id;

    if remaining_admins = 0 then
      raise exception 'last_admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists team_members_prevent_last_admin on team_members;
create trigger team_members_prevent_last_admin
  before delete or update of role on team_members
  for each row
  execute function prevent_last_admin_removal();

-- Lista o histórico — já não precisa de join com auth.users pra mostrar
-- nome (target_email/actor_email são snapshots guardados na própria
-- tabela), só confirma que quem pergunta é team_admin.
create or replace function list_team_access_log(p_team_id uuid)
returns table (
  id uuid,
  event_type access_log_event,
  role team_role,
  target_email text,
  actor_email text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.event_type, l.role, l.target_email, l.actor_email, l.created_at
  from team_access_log l
  where l.team_id = p_team_id
    and has_team_role(p_team_id, array['team_admin']::team_role[])
  order by l.created_at desc;
$$;

grant execute on function list_team_access_log(uuid) to authenticated;
