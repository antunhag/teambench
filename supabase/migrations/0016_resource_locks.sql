-- Trava genérica "uma conta, um recurso, até libertar" — generaliza o mesmo
-- padrão já usado pro jogo ao vivo (migração 0009, matches.live_holder_id)
-- pras telas de gestão da equipa: Plantel, Formato de Jogo, Convites. Essas
-- três telas já só são editáveis por team_admin (ver 0004_tighten_role_permissions.sql
-- e 0007/0015 pros convites) — por isso a trava também exige team_admin,
-- nunca data_entry/viewer, igual à escrita que ela está a proteger.
--
-- Por TELA inteira, não por registo individual (ex.: um atleta específico) —
-- decisão deliberada de manter simples, dado o volume real de utilizadores
-- simultâneos por equipa (ver specs/001-multi-user-access/research.md, Decisão 6).
--
-- Ao contrário de `matches` (uma linha por jogo já existe desde a criação),
-- aqui a linha só passa a existir quando alguém reivindica pela primeira vez
-- — por isso claim_resource_lock usa INSERT ... ON CONFLICT DO UPDATE, não
-- um UPDATE simples como claim_live_match.

create type lock_resource_type as enum ('roster', 'match_format', 'invites');

create table resource_locks (
  team_id uuid not null references teams(id) on delete cascade,
  resource_type lock_resource_type not null,
  holder_id uuid references auth.users(id),
  heartbeat_at timestamptz,
  primary key (team_id, resource_type)
);

alter table resource_locks enable row level security;

-- Leitura: qualquer membro da equipa — mesmo quem não pode editar (Lançador
-- de dados, Visualizador) pode ver "quem está a editar agora" se a UI
-- quiser mostrar isso. Escrita só pelas funções abaixo, nunca direto.
create policy resource_locks_select_member on resource_locks for select
  using (team_id in (select my_team_ids()));

create or replace function claim_resource_lock(p_team_id uuid, p_resource_type lock_resource_type)
returns resource_locks
language plpgsql
security definer
set search_path = public
as $$
declare
  l resource_locks;
begin
  if not has_team_role(p_team_id, array['team_admin']::team_role[]) then
    raise exception 'not_authorized';
  end if;

  -- Reivindica se: a linha ainda não existe (primeira vez), ninguém segura a
  -- trava, já sou eu quem segura (renovação do heartbeat), ou quem segurava
  -- sumiu há mais de 45s (aparelho desligou/fechou sem libertar) — mesmo
  -- limiar e mesma folga de 2 ciclos de heartbeat (20s cada) que claim_live_match.
  insert into resource_locks (team_id, resource_type, holder_id, heartbeat_at)
  values (p_team_id, p_resource_type, auth.uid(), now())
  on conflict (team_id, resource_type) do update
    set holder_id = auth.uid(), heartbeat_at = now()
    where resource_locks.holder_id is null
       or resource_locks.holder_id = auth.uid()
       or resource_locks.heartbeat_at < now() - interval '45 seconds'
  returning * into l;

  if not found then
    select * into l from resource_locks where team_id = p_team_id and resource_type = p_resource_type;
  end if;

  return l;
end;
$$;

grant execute on function claim_resource_lock(uuid, lock_resource_type) to authenticated;

create or replace function release_resource_lock(p_team_id uuid, p_resource_type lock_resource_type)
returns void
language sql
security definer
set search_path = public
as $$
  update resource_locks
  set holder_id = null, heartbeat_at = null
  where team_id = p_team_id and resource_type = p_resource_type and holder_id = auth.uid();
$$;

grant execute on function release_resource_lock(uuid, lock_resource_type) to authenticated;
