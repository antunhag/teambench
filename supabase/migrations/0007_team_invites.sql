-- Convite de um segundo utilizador para a equipa (Admin da Equipa convida um
-- Lançador de dados/Visualizador, ou outro Admin). A tabela `invites` já
-- existia desde 0001 mas nunca ganhou o fluxo de aceitação.
--
-- Aproveitamos para fechar uma brecha real encontrada ao desenhar isto: a
-- política team_members_insert_self_or_head_coach (0002) permitia
-- `user_id = auth.uid()` sem NENHUMA outra condição — ou seja, qualquer
-- utilizador autenticado podia inserir-se a si próprio em team_members de
-- QUALQUER equipa (bastava saber o UUID), com o papel que quisesse. Isso só
-- não foi explorado porque nunca foi exposto na UI, mas a política em si já
-- permitia. A partir de agora, o auto-insert só é permitido quando o
-- utilizador é admin do clube dono dessa equipa (o caso legítimo: criar a
-- equipa e tornar-se automaticamente o seu team_admin) — entrar via convite
-- passa a ser feito só pela função accept_invite(), que corre com
-- privilégio elevado e valida o convite antes de inserir.

drop policy if exists team_members_insert_self_or_head_coach on team_members;
create policy team_members_insert_self_or_club_admin on team_members for insert
  with check (
    has_team_role(team_id, array['team_admin']::team_role[])
    or (
      user_id = auth.uid()
      and team_id in (select id from teams where club_id in (select my_club_ids()))
    )
  );

-- invites: só team_admin cria/revoga (antes também permitia data_entry,
-- inconsistente com o resto da separação de papéis feita em 0004).
drop policy if exists invites_insert_coach on invites;
create policy invites_insert_admin on invites for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));

create policy invites_delete_admin on invites for delete
  using (has_team_role(team_id, array['team_admin']::team_role[]));

-- O convidado ainda não é membro da equipa (my_team_ids() não o inclui), por
-- isso precisa de uma via própria para ver o seu próprio convite pendente —
-- por email, não por equipa.
create policy invites_select_own_email on invites for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Aceitar um convite é uma operação composta (validar + inserir em
-- team_members + marcar aceite) — mais seguro como função SECURITY DEFINER
-- única e atómica do que tentar montar isto com políticas de RLS soltas.
create or replace function accept_invite(p_token uuid)
returns team_members
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invites;
  new_member team_members;
begin
  select * into inv from invites where token = p_token;

  if inv is null then
    raise exception 'invite_not_found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'invite_already_accepted';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'invite_email_mismatch';
  end if;

  insert into team_members (team_id, user_id, role)
  values (inv.team_id, auth.uid(), inv.role)
  on conflict (team_id, user_id) do update set role = excluded.role
  returning * into new_member;

  update invites set accepted_at = now() where id = inv.id;

  return new_member;
end;
$$;

grant execute on function accept_invite(uuid) to authenticated;

-- Lista os membros da equipa com email (auth.users não é legível pelo
-- cliente diretamente) — só para quem já é team_admin dessa equipa.
create or replace function list_team_members_with_email(p_team_id uuid)
returns table (id uuid, user_id uuid, role team_role, email text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select tm.id, tm.user_id, tm.role, u.email, tm.created_at
  from team_members tm
  join auth.users u on u.id = tm.user_id
  where tm.team_id = p_team_id
    and has_team_role(p_team_id, array['team_admin']::team_role[])
  order by tm.created_at asc;
$$;

grant execute on function list_team_members_with_email(uuid) to authenticated;
