-- Corrige "infinite recursion detected in policy for relation team_members".
--
-- Causa: a política de SELECT de team_members consultava a própria
-- team_members dentro do seu USING (...) — cada avaliação da política
-- disparava a mesma política de novo, num loop infinito.
--
-- Correção padrão do Postgres/Supabase para este caso: mover a consulta a
-- team_members para dentro de funções SECURITY DEFINER. Uma função assim
-- roda com o privilégio do seu dono (o dono da migração), que — por não
-- termos FORCE ROW LEVEL SECURITY nessa tabela — está isento das políticas
-- de RLS na sua própria consulta interna. Isso quebra o ciclo: a política
-- chama a função, a função lê team_members sem reativar a política.
--
-- Por isso também removemos FORCE ROW LEVEL SECURITY de todas as tabelas:
-- nenhum cliente da aplicação jamais se conecta como dono da tabela, então
-- FORCE não trazia nenhuma proteção real aqui — só criava esta armadilha.

alter table teams no force row level security;
alter table profiles no force row level security;
alter table team_members no force row level security;
alter table invites no force row level security;
alter table players no force row level security;
alter table match_formats no force row level security;
alter table matches no force row level security;
alter table match_events no force row level security;

create or replace function my_team_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select team_id from team_members where user_id = auth.uid();
$$;

create or replace function has_team_role(p_team_id uuid, p_roles team_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and role = any(p_roles)
  );
$$;

grant execute on function my_team_ids() to authenticated;
grant execute on function has_team_role(uuid, team_role[]) to authenticated;

-- team_members
drop policy if exists team_members_select_same_team on team_members;
create policy team_members_select_same_team on team_members for select
  using (team_id in (select my_team_ids()));

drop policy if exists team_members_insert_self_or_head_coach on team_members;
create policy team_members_insert_self_or_head_coach on team_members for insert
  with check (
    user_id = auth.uid()
    or has_team_role(team_id, array['head_coach']::team_role[])
  );

drop policy if exists team_members_delete_head_coach on team_members;
create policy team_members_delete_head_coach on team_members for delete
  using (has_team_role(team_id, array['head_coach']::team_role[]));

-- teams
drop policy if exists teams_select_member on teams;
create policy teams_select_member on teams for select
  using (id in (select my_team_ids()));

drop policy if exists teams_update_head_coach on teams;
create policy teams_update_head_coach on teams for update
  using (has_team_role(id, array['head_coach']::team_role[]));

-- invites
drop policy if exists invites_select_team on invites;
create policy invites_select_team on invites for select
  using (team_id in (select my_team_ids()));

drop policy if exists invites_insert_coach on invites;
create policy invites_insert_coach on invites for insert
  with check (has_team_role(team_id, array['head_coach','assistant']::team_role[]));

-- players
drop policy if exists players_select_team on players;
create policy players_select_team on players for select
  using (team_id in (select my_team_ids()));

drop policy if exists players_write_coach on players;
create policy players_write_coach on players for insert
  with check (has_team_role(team_id, array['head_coach','assistant']::team_role[]));

drop policy if exists players_update_coach on players;
create policy players_update_coach on players for update
  using (has_team_role(team_id, array['head_coach','assistant']::team_role[]));

-- match_formats
drop policy if exists match_formats_select_team on match_formats;
create policy match_formats_select_team on match_formats for select
  using (team_id in (select my_team_ids()));

drop policy if exists match_formats_write_coach on match_formats;
create policy match_formats_write_coach on match_formats for insert
  with check (has_team_role(team_id, array['head_coach','assistant']::team_role[]));

drop policy if exists match_formats_update_coach on match_formats;
create policy match_formats_update_coach on match_formats for update
  using (has_team_role(team_id, array['head_coach','assistant']::team_role[]));

-- matches
drop policy if exists matches_select_team on matches;
create policy matches_select_team on matches for select
  using (team_id in (select my_team_ids()));

drop policy if exists matches_write_coach on matches;
create policy matches_write_coach on matches for insert
  with check (has_team_role(team_id, array['head_coach','assistant']::team_role[]));

drop policy if exists matches_update_coach on matches;
create policy matches_update_coach on matches for update
  using (has_team_role(team_id, array['head_coach','assistant']::team_role[]));

-- match_events
drop policy if exists match_events_select_team on match_events;
create policy match_events_select_team on match_events for select
  using (team_id in (select my_team_ids()));

drop policy if exists match_events_write_coach on match_events;
create policy match_events_write_coach on match_events for insert
  with check (has_team_role(team_id, array['head_coach','assistant']::team_role[]));
