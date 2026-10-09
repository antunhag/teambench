-- Peso de confiança do treinador num atleta, numa vaga, pra UM jogo
-- específico — pra alimentar a geração automática de plano de rotação
-- (specs/004-rotation-plan-generation/). Diferente de `player_aptitudes`
-- (classificação estável do atleta, vale pra todo jogo futuro), isto é uma
-- decisão tática pontual: o treinador pode, pra este jogo, dar mais peso a
-- um atleta numa vaga onde a aptidão cadastrada é mais baixa (ex.: "A" na
-- Ala Esquerda, mas precisa jogar mais como Fixo neste jogo específico) —
-- sem alterar `player_aptitudes` nem um pouco.
--
-- `weight` fica numa escala curta (1 a 5), nunca um número livre — mesmo
-- raciocínio de simplicidade já aplicado a `quality` (A/B/C) em
-- player_aptitudes: o treinador ajusta "mais" ou "menos" confiança, não
-- calibra um percentual.
--
-- `unique (match_id, player_id, slot_type)` garante um único peso vigente
-- por combinação — ajustar de novo faz upsert, nunca acumula histórico.
--
-- RLS nova aqui (tabela nova, não colunas sob uma policy já existente —
-- diferente da migração 0021) — revisado pelo security-auditor antes de
-- aplicar (Princípio II da constituição, ver Constitution Check em
-- specs/004-rotation-plan-generation/plan.md). Mesmo padrão de escrita de
-- rotation_plan_stints (migração 0012): só team_admin, planeamento tático
-- não é do Lançador de dados.

create table rotation_plan_weights (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade, -- denormalizado, mesmo padrão de rotation_plan_stints
  player_id uuid not null references players(id) on delete cascade,
  slot_type text not null check (slot_type in ('Fixo', 'Ala Esquerda', 'Ala Direita', 'Pivô')),
  weight int not null check (weight between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id, slot_type)
);
create trigger rotation_plan_weights_set_updated_at before update on rotation_plan_weights
  for each row execute function set_updated_at();
create index rotation_plan_weights_match_id_idx on rotation_plan_weights (match_id);
create index rotation_plan_weights_team_id_idx on rotation_plan_weights (team_id);

alter table rotation_plan_weights enable row level security;
-- NUNCA "force row level security" — ver 0002_fix_team_members_recursion.sql.

create policy rotation_plan_weights_select_team on rotation_plan_weights for select
  using (team_id in (select my_team_ids()));
create policy rotation_plan_weights_insert_admin on rotation_plan_weights for insert
  with check (has_team_role(team_id, array['team_admin']::team_role[]));
create policy rotation_plan_weights_update_admin on rotation_plan_weights for update
  using (has_team_role(team_id, array['team_admin']::team_role[]));
create policy rotation_plan_weights_delete_admin on rotation_plan_weights for delete
  using (has_team_role(team_id, array['team_admin']::team_role[]));
