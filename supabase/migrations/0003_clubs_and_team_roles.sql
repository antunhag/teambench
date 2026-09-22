-- Introduz o nível de Clube acima de Equipa (um clube pode ter várias
-- equipas — Sub-13, Sub-15, Sub-17...) e separa os papéis dentro da equipa
-- em administração (plantel/configurações) vs. lançamento de dados
-- (registo do jogo ao vivo).
--
-- Hierarquia resultante:
--   clubs -> club_members (Admin do Clube: acesso implícito a TODAS as
--            equipas do clube, sem precisar entrar em cada uma)
--   teams (agora com club_id) -> team_members (team_admin | data_entry | viewer)

-- Renomear valores do enum é seguro: o Postgres guarda a referência interna
-- do valor (não o texto) nas políticas já criadas — o rename só muda o
-- rótulo de exibição, não quebra nada que já use o valor antigo.
alter type team_role rename value 'head_coach' to 'team_admin';
alter type team_role rename value 'assistant' to 'data_entry';

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

alter table clubs enable row level security;
alter table club_members enable row level security;

create or replace function my_club_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select club_id from club_members where user_id = auth.uid();
$$;
grant execute on function my_club_ids() to authenticated;

create policy clubs_select_member on clubs for select
  using (id in (select my_club_ids()));
create policy clubs_insert_any_authenticated on clubs for insert
  with check (auth.uid() is not null);

create policy club_members_select_same_club on club_members for select
  using (club_id in (select my_club_ids()));
-- Por agora só o próprio usuário se insere (fluxo "criar clube -> vira admin dele").
-- Convidar outro admin de clube é funcionalidade futura, fora de escopo aqui.
create policy club_members_insert_self on club_members for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- teams passa a pertencer a um clube
-- ---------------------------------------------------------------------------

alter table teams add column club_id uuid references clubs(id);

-- Backfill: qualquer equipa criada antes deste clube existir (ex.: a equipa
-- de teste já criada) ganha um clube novo, com o mesmo team_admin como
-- admin do clube.
do $$
declare
  r record;
  new_club_id uuid;
begin
  for r in select * from teams where club_id is null loop
    new_club_id := gen_random_uuid();
    insert into clubs (id, name, slug) values (new_club_id, r.name, r.slug || '-clube');
    insert into club_members (club_id, user_id)
      select new_club_id, tm.user_id from team_members tm
      where tm.team_id = r.id and tm.role = 'team_admin';
    update teams set club_id = new_club_id where id = r.id;
  end loop;
end $$;

alter table teams alter column club_id set not null;

-- teams: visível para admin do clube (todas as equipas) OU membro daquela equipa específica.
drop policy if exists teams_select_member on teams;
create policy teams_select_member on teams for select
  using (
    club_id in (select my_club_ids())
    or id in (select my_team_ids())
  );

-- teams: só admin do clube cria equipas dentro dele.
drop policy if exists teams_insert_any_authenticated on teams;
create policy teams_insert_club_admin on teams for insert
  with check (club_id in (select my_club_ids()));

-- teams: admin do clube OU team_admin daquela equipa pode atualizar.
drop policy if exists teams_update_head_coach on teams;
create policy teams_update_admin on teams for update
  using (
    club_id in (select my_club_ids())
    or has_team_role(id, array['team_admin']::team_role[])
  );
