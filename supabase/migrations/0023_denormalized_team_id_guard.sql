-- Dois buracos sistémicos encontrados pelo security-auditor ao revisar a
-- migração 0022 (rotation_plan_weights), mas que já existiam desde 0012
-- (rotation_plan_stints) e 0013 (player_aptitudes) — as três tabelas
-- denormalizam `team_id` na linha filha (mesmo padrão de match_events), mas
-- nunca tiveram o mesmo endurecimento que `teams.club_id` ganhou em 0015.
--
-- 1) Nada validava que o `team_id` da linha bate com o `team_id` real da
-- entidade apontada pela FK "de raiz" de cada tabela
-- (`player_aptitudes.player_id` -> `players.team_id`;
-- `rotation_plan_stints.plan_id` -> `rotation_plans.team_id` e
-- `.player_id` -> `players.team_id`; `rotation_plan_weights.match_id` ->
-- `matches.team_id` e `.player_id` -> `players.team_id`). Um team_admin de
-- mais de uma equipa conseguia, em teoria, inserir `team_id=EquipaA` com uma
-- FK apontando pra dado de EquipaB.
--
-- 2) As policies de UPDATE destas três tabelas (`using`, sem `with check`)
-- sofrem do mesmo problema já corrigido pra `teams.club_id` em 0015: o
-- Postgres reavalia o `using` contra a linha NOVA, então `team_id` não está
-- protegido de ser trocado pra outra equipa que o mesmo admin administra.
--
-- Fix: um único trigger (reaproveitado nas três tabelas, por isso uma só
-- função) antes de insert/update que (a) recalcula o `team_id` esperado a
-- partir da(s) FK(s) de cada tabela e rejeita divergência, e (b) proíbe
-- mudar `team_id`/`player_id`/`plan_id`/`match_id` depois de inserido — mesma
-- razão do `teams_club_reassignment_guard` (0015) e do
-- `prevent_team_member_identity_change` (0018): RLS sozinho não compara OLD
-- vs NEW, só um trigger compara. Nenhum código da aplicação muda esses
-- campos depois de criar a linha hoje — `usePlayerAptitudes.ts` e
-- `useRotationPlan.ts` só fazem delete+reinsert, e `useRotationWeights.ts`
-- só faz upsert pela própria chave `(match_id, player_id, slot_type)` com os
-- mesmos valores de FK — então o trigger não quebra nenhum fluxo existente.
--
-- Revisado pelo security-auditor antes de aplicar (Princípio II da
-- constituição).

create or replace function guard_denormalized_team_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_team_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.team_id is distinct from old.team_id then
      raise exception 'team_id não pode ser alterado depois de criado.';
    end if;
    if tg_table_name = 'player_aptitudes' and new.player_id is distinct from old.player_id then
      raise exception 'player_id não pode ser alterado depois de criado.';
    elsif tg_table_name = 'rotation_plan_stints'
      and (new.plan_id is distinct from old.plan_id or new.player_id is distinct from old.player_id) then
      raise exception 'plan_id/player_id não podem ser alterados depois de criados.';
    elsif tg_table_name = 'rotation_plan_weights'
      and (new.match_id is distinct from old.match_id or new.player_id is distinct from old.player_id) then
      raise exception 'match_id/player_id não podem ser alterados depois de criados.';
    end if;
  end if;

  if tg_table_name = 'player_aptitudes' then
    select team_id into expected_team_id from players where id = new.player_id;
  elsif tg_table_name = 'rotation_plan_stints' then
    select team_id into expected_team_id from rotation_plans where id = new.plan_id;
    if expected_team_id is distinct from new.team_id then
      raise exception 'team_id não corresponde à equipa do plano (plan_id).';
    end if;
    select team_id into expected_team_id from players where id = new.player_id;
  elsif tg_table_name = 'rotation_plan_weights' then
    select team_id into expected_team_id from matches where id = new.match_id;
    if expected_team_id is distinct from new.team_id then
      raise exception 'team_id não corresponde à equipa do jogo (match_id).';
    end if;
    select team_id into expected_team_id from players where id = new.player_id;
  end if;

  if expected_team_id is distinct from new.team_id then
    raise exception 'team_id não corresponde à equipa do atleta (player_id).';
  end if;

  return new;
end;
$$;

drop trigger if exists player_aptitudes_team_id_guard on player_aptitudes;
create trigger player_aptitudes_team_id_guard
  before insert or update on player_aptitudes
  for each row execute function guard_denormalized_team_id();

drop trigger if exists rotation_plan_stints_team_id_guard on rotation_plan_stints;
create trigger rotation_plan_stints_team_id_guard
  before insert or update on rotation_plan_stints
  for each row execute function guard_denormalized_team_id();

drop trigger if exists rotation_plan_weights_team_id_guard on rotation_plan_weights;
create trigger rotation_plan_weights_team_id_guard
  before insert or update on rotation_plan_weights
  for each row execute function guard_denormalized_team_id();
