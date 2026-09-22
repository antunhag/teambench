-- Ajusta as políticas de escrita para refletir a separação de papéis que
-- ficou decidida (Admin da Equipa gerencia plantel/configurações;
-- Lançador de dados só regista o jogo ao vivo). As políticas de 0001 ainda
-- permitiam os dois papéis escreverem em tudo — correto para match_events
-- (é exatamente o registo ao vivo), mas errado para plantel/formato/jogos.

drop policy if exists players_write_coach on players;
create policy players_write_coach on players for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));

drop policy if exists players_update_coach on players;
create policy players_update_coach on players for update
  using (has_team_role(team_id, array['team_admin']::team_role[]));

drop policy if exists match_formats_write_coach on match_formats;
create policy match_formats_write_coach on match_formats for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));

drop policy if exists match_formats_update_coach on match_formats;
create policy match_formats_update_coach on match_formats for update
  using (has_team_role(team_id, array['team_admin']::team_role[]));

drop policy if exists matches_write_coach on matches;
create policy matches_write_coach on matches for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));

drop policy if exists matches_update_coach on matches;
create policy matches_update_coach on matches for update
  using (has_team_role(team_id, array['team_admin']::team_role[]));

-- match_events fica como estava (team_admin E data_entry podem escrever) —
-- é exatamente o registo do jogo ao vivo, o papel do Lançador de dados.
