-- Fase 1 — esquema inicial multi-equipa (teams/players/matches/events) com
-- isolamento por equipa via Row Level Security.
--
-- Princípio de privacidade (o plantel é de menores de idade): toda tabela que
-- pode conter dado de um atleta carrega o seu próprio `team_id`, mesmo quando
-- isso significa denormalizar um campo que já existe via relação (ex.:
-- match_events.team_id, que também está disponível através de matches.team_id).
-- Isto evita que uma política de RLS precise de um JOIN para decidir acesso —
-- um bug de política numa tabela não pode "vazar" através de outra.

create extension if not exists pgcrypto;

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Equipas (tenants) e associação de usuários
-- ---------------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'free',      -- reservado para faturação futura, sem uso ainda
  status text not null default 'active',  -- reservado para faturação futura, sem uso ainda
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create type team_role as enum ('head_coach', 'assistant', 'viewer');

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role team_role not null default 'assistant',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  email text not null,
  role team_role not null default 'assistant',
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plantel — formato de jogo — jogos — eventos
-- ---------------------------------------------------------------------------

create table players (
  id uuid primary key default gen_random_uuid(), -- identidade estável, equivalente ao uid() do banco.html
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  number text,             -- rótulo de exibição — pode repetir dentro da mesma equipa (caso real conhecido)
  position text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger players_set_updated_at before update on players
  for each row execute function set_updated_at();

create table match_formats (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,                        -- ex.: "Campeonato Distrital Sub-15"
  period_count int not null default 2,
  period_minutes int not null default 25,
  overtime_period_count int not null default 0,
  overtime_minutes int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),  -- gerado no dispositivo — estável mesmo criado offline
  team_id uuid not null references teams(id) on delete cascade,
  format_id uuid references match_formats(id),
  opponent text,
  match_date date,
  kickoff_time time,
  competition text,
  location text,
  status text not null default 'scheduled', -- scheduled | live | finished
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger matches_set_updated_at before update on matches
  for each row execute function set_updated_at();
create index matches_team_id_idx on matches (team_id);

create table match_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,   -- gerado no dispositivo — chave de idempotência da sincronização
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade, -- denormalizado por segurança (ver nota no topo)
  type text not null,          -- 'golo' | 'golo_sofrido' | 'cartao_amarelo' | 'substituicao' | ...
  player_id uuid references players(id),
  payload jsonb not null default '{}',
  ms bigint,
  min int,
  sec int,
  period int,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index match_events_match_id_idx on match_events (match_id);
create index match_events_team_id_idx on match_events (team_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — isolamento por equipa
-- ---------------------------------------------------------------------------

alter table teams enable row level security;
alter table teams force row level security;
alter table profiles enable row level security;
alter table profiles force row level security;
alter table team_members enable row level security;
alter table team_members force row level security;
alter table invites enable row level security;
alter table invites force row level security;
alter table players enable row level security;
alter table players force row level security;
alter table match_formats enable row level security;
alter table match_formats force row level security;
alter table matches enable row level security;
alter table matches force row level security;
alter table match_events enable row level security;
alter table match_events force row level security;

-- profiles: cada usuário só vê/edita o próprio perfil.
create policy profiles_self on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- teams: visível para quem é membro; criação é livre (o próprio insert de
-- team_members logo a seguir é que precisa da equipa já existir).
create policy teams_select_member on teams for select
  using (id in (select team_id from team_members where user_id = auth.uid()));
create policy teams_insert_any_authenticated on teams for insert
  with check (auth.uid() is not null);
create policy teams_update_head_coach on teams for update
  using (id in (select team_id from team_members where user_id = auth.uid() and role = 'head_coach'));

-- team_members: membros veem os colegas de equipa; só head_coach gerencia.
create policy team_members_select_same_team on team_members for select
  using (team_id in (select team_id from team_members m2 where m2.user_id = auth.uid()));
create policy team_members_insert_self_or_head_coach on team_members for insert
  with check (
    user_id = auth.uid() -- permite o próprio usuário se juntar (ex.: criar a equipa, aceitar convite)
    or team_id in (select team_id from team_members where user_id = auth.uid() and role = 'head_coach')
  );
create policy team_members_delete_head_coach on team_members for delete
  using (team_id in (select team_id from team_members where user_id = auth.uid() and role = 'head_coach'));

-- invites: só head_coach/assistant da equipa criam e veem convites.
create policy invites_select_team on invites for select
  using (team_id in (select team_id from team_members where user_id = auth.uid()));
create policy invites_insert_coach on invites for insert
  with check (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));

-- Padrão repetido em players / match_formats / matches / match_events:
-- select para qualquer membro da equipa, escrita só para head_coach/assistant.
create policy players_select_team on players for select
  using (team_id in (select team_id from team_members where user_id = auth.uid()));
create policy players_write_coach on players for insert
  with check (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));
create policy players_update_coach on players for update
  using (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));

create policy match_formats_select_team on match_formats for select
  using (team_id in (select team_id from team_members where user_id = auth.uid()));
create policy match_formats_write_coach on match_formats for insert
  with check (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));
create policy match_formats_update_coach on match_formats for update
  using (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));

create policy matches_select_team on matches for select
  using (team_id in (select team_id from team_members where user_id = auth.uid()));
create policy matches_write_coach on matches for insert
  with check (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));
create policy matches_update_coach on matches for update
  using (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));

create policy match_events_select_team on match_events for select
  using (team_id in (select team_id from team_members where user_id = auth.uid()));
create policy match_events_write_coach on match_events for insert
  with check (team_id in (select team_id from team_members where user_id = auth.uid() and role in ('head_coach','assistant')));
-- Eventos são só-acrescenta por desenho (um "desfazer" é um novo evento) — sem policy de update/delete de propósito.
