-- Dois buracos reais encontrados na primeira auditoria de segurança formal do
-- projeto (subagente security-auditor, 2026-10-07) — nenhum dos dois foi
-- explorado na prática, mas os dois passam RLS hoje e não deveriam.

-- 1) invites: a policy de SELECT original (0002, invites_select_team) nunca foi
-- apertada quando 0007 trouxe o fluxo de convites de verdade. 0007 só mexeu em
-- insert/delete (team_admin) e ACRESCENTOU invites_select_own_email (pro
-- convidado ver o próprio convite) — mas invites_select_team continuou de pé,
-- permitindo policies OR entre si: qualquer membro da equipa (Lançador de
-- dados, Visualizador, não só Admin) conseguia ler TODA a tabela invites da
-- sua equipa, incluindo o `token` (a credencial que accept_invite confia) e o
-- email/papel de quem foi convidado. accept_invite() continua a validar o
-- email de quem está autenticado, então um token "roubado" por essa leitura
-- não dava pra aceitar o convite de outra pessoa — mas a exposição do token e
-- do email em si já é mais do que deveria, ainda mais com dados de um clube
-- de menores (ver docs/SECURITY.md).
drop policy if exists invites_select_team on invites;
create policy invites_select_admin on invites for select
  using (has_team_role(team_id, array['team_admin']::team_role[]));

-- 2) teams: teams_update_admin (0003) permite update tanto pra admin do clube
-- quanto pra team_admin daquela equipa especificamente (dois caminhos
-- independentes de autorização) — mas sem with check, então por padrão do
-- Postgres a mesma expressão do using é reavaliada contra a linha NOVA. Como
-- has_team_role(id, ['team_admin']) não depende de club_id, um team_admin que
-- NÃO é admin do clube conseguia fazer UPDATE teams SET club_id = <qualquer
-- clube> — movendo a própria equipa pra debaixo de um clube que não
-- administra. Um with check simples (ex.: "club_id tem de estar em
-- my_club_ids()") quebraria o caso legítimo de um team_admin comum editando
-- OUTRO campo (ex.: nome) sem mexer em club_id, já que RLS não compara
-- OLD vs NEW — por isso o guard fica num trigger, só no club_id.
create or replace function prevent_unauthorized_club_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.club_id is distinct from old.club_id then
    if not (new.club_id in (select my_club_ids())) then
      raise exception 'Só um admin do clube de destino pode mover uma equipa pra ele.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists teams_club_reassignment_guard on teams;
create trigger teams_club_reassignment_guard
  before update on teams
  for each row
  execute function prevent_unauthorized_club_reassignment();
