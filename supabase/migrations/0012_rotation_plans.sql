-- Planeador de rotações: previsão de tempo em quadra e substituições a
-- partir de quem foi convocado, construída pelo Admin da Equipa antes do
-- jogo. Ao contrário de match_events (fatos do que já aconteceu), isto é um
-- plano hipotético — por isso mora em tabelas próprias, nunca em
-- match_events, e `match_id` é único: um plano só por jogo.
--
-- Mesmo padrão de escrita de players/match_formats/matches (team_admin
-- apenas) — planeamento tático fica com quem administra a equipa, não com o
-- Lançador de dados, que só regista o jogo ao vivo (ver comentário no topo
-- de 0004_tighten_role_permissions.sql).

create table rotation_plans (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger rotation_plans_set_updated_at before update on rotation_plans
  for each row execute function set_updated_at();
create index rotation_plans_team_id_idx on rotation_plans (team_id);

create table rotation_plan_stints (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references rotation_plans(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade, -- denormalizado, mesmo padrão de match_events
  player_id uuid not null references players(id) on delete cascade,
  slot_index int not null,      -- 0..3 — vaga de linha (guarda-redes nunca entra aqui)
  period int not null,
  start_sec int not null,
  end_sec int not null check (end_sec > start_sec),
  created_at timestamptz not null default now()
);
create index rotation_plan_stints_plan_id_idx on rotation_plan_stints (plan_id);
create index rotation_plan_stints_team_id_idx on rotation_plan_stints (team_id);

alter table rotation_plans enable row level security;
alter table rotation_plan_stints enable row level security;
-- NUNCA "force row level security" aqui — ver 0002_fix_team_members_recursion.sql:
-- nenhum cliente da aplicação conecta como dono da tabela, force não protege
-- nada e só recria a armadilha de recursão que aquela migração corrigiu.

create policy rotation_plans_select_team on rotation_plans for select
  using (team_id in (select my_team_ids()));
create policy rotation_plans_insert_admin on rotation_plans for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));
create policy rotation_plans_update_admin on rotation_plans for update
  using (has_team_role(team_id, array['team_admin']::team_role[]));
create policy rotation_plans_delete_admin on rotation_plans for delete
  using (has_team_role(team_id, array['team_admin']::team_role[]));

create policy rotation_plan_stints_select_team on rotation_plan_stints for select
  using (team_id in (select my_team_ids()));
create policy rotation_plan_stints_insert_admin on rotation_plan_stints for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));
create policy rotation_plan_stints_update_admin on rotation_plan_stints for update
  using (has_team_role(team_id, array['team_admin']::team_role[]));
create policy rotation_plan_stints_delete_admin on rotation_plan_stints for delete
  using (has_team_role(team_id, array['team_admin']::team_role[]));
