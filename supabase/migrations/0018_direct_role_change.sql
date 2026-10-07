-- Permite um team_admin mudar diretamente o papel de outro membro da
-- equipa, em vez do atalho indireto que existia até aqui (reconvidar a
-- mesma pessoa com outro papel, deixando accept_invite() trocar via
-- ON CONFLICT DO UPDATE). Reaproveita toda a infraestrutura já construída
-- na migração 0017 sem precisar tocar nela: o histórico
-- (log_team_member_role_changed) e a proteção do último Admin
-- (prevent_last_admin_removal) já disparam em QUALQUER "update of role" em
-- team_members, não só o caminho do convite — bastou abrir a porta com uma
-- policy de RLS.

-- A policy abaixo (USING/WITH CHECK) não consegue sozinha impedir um
-- team_admin de reatribuir a linha pra outra equipa ou pra outra conta via
-- update — RLS não compara OLD vs NEW (mesma razão documentada em
-- teams_update_admin, migração 0015). Único ponto desta migração que troca
-- mão de teams_update_admin: aqui é team_members, não teams; a lógica é a
-- mesma.
create or replace function prevent_team_member_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.team_id <> old.team_id or new.user_id <> old.user_id then
    raise exception 'team_members: team_id/user_id não podem mudar via update';
  end if;
  return new;
end;
$$;

drop trigger if exists team_members_prevent_identity_change on team_members;
create trigger team_members_prevent_identity_change
  before update on team_members
  for each row
  execute function prevent_team_member_identity_change();

-- Só team_admin muda papéis, e só dentro da própria equipa — mesmo padrão
-- de autorização de toda a superfície de team_members (insert/delete,
-- migrações 0002/0007). Nada aqui permite mudar team_id/user_id (bloqueado
-- acima); só sobra "role" como coisa que um update legítimo muda de facto.
create policy team_members_update_admin on team_members for update
  using (has_team_role(team_id, array['team_admin']::team_role[]))
  with check (has_team_role(team_id, array['team_admin']::team_role[]));
