-- Suporte aos módulos de cadastro (clube, calendário): faltavam as políticas
-- de UPDATE em clubs e DELETE em matches — só existia select/insert.

create policy clubs_update_member on clubs for update
  using (id in (select my_club_ids()));

create policy matches_delete_admin on matches for delete
  using (has_team_role(team_id, array['team_admin']::team_role[]));
