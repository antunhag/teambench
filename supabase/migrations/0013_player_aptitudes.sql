-- Aptidões do atleta: até 4 posições que sabe jogar, em ordem de prioridade
-- (ex.: Martim Santos -> Ala Esquerda, Ala Direita, Pivô). Diferente de
-- rotation_plan_stints (por jogo), isto é dado do ATLETA — cadastra uma vez,
-- vale pra todo plano futuro. Mesmo padrão de escrita de players/
-- match_formats (team_admin apenas, ver 0004_tighten_role_permissions.sql).
--
-- As duas "unique" evitam ambiguidade (a mesma vaga duas vezes, ou duas
-- vagas com a mesma prioridade) — mas a UI nunca deve deixar chegar a isso:
-- salvar apaga tudo do atleta e reinsere, então um insert rejeitado por
-- violar a unique deixaria o atleta sem aptidão nenhuma (o delete já teria
-- acontecido). A validação de duplicata é client-side, obrigatória.

create table player_aptitudes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade, -- denormalizado, mesmo padrão de match_events
  slot_type text not null check (slot_type in ('Fixo', 'Ala Esquerda', 'Ala Direita', 'Pivô')),
  priority int not null check (priority >= 0 and priority < 4),
  created_at timestamptz not null default now(),
  unique (player_id, slot_type),
  unique (player_id, priority)
);
create index player_aptitudes_player_id_idx on player_aptitudes (player_id);
create index player_aptitudes_team_id_idx on player_aptitudes (team_id);

alter table player_aptitudes enable row level security;
-- NUNCA "force row level security" — ver 0002_fix_team_members_recursion.sql.

create policy player_aptitudes_select_team on player_aptitudes for select
  using (team_id in (select my_team_ids()));
create policy player_aptitudes_insert_admin on player_aptitudes for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));
create policy player_aptitudes_update_admin on player_aptitudes for update
  using (has_team_role(team_id, array['team_admin']::team_role[]));
create policy player_aptitudes_delete_admin on player_aptitudes for delete
  using (has_team_role(team_id, array['team_admin']::team_role[]));
