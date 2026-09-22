-- A tela de aceitar convite precisa mostrar o nome da equipa antes do
-- convidado ser membro dela — mas a política de teams_select_member (0002/0003)
-- só libera leitura para quem já é membro do clube ou da equipa, então o
-- join `invites -> teams` feito direto do cliente voltava vazio por RLS
-- (não por erro: a linha do convite aparecia, o nome da equipa não).
--
-- Em vez de afrouxar a política de teams (que existe para não vazar dados
-- de equipas de outros clubes), expomos só o necessário via função
-- SECURITY DEFINER, com a mesma validação de email de accept_invite().
create or replace function preview_invite(p_token uuid)
returns table (email text, role team_role, team_name text, expires_at timestamptz, accepted_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select i.email, i.role, t.name, i.expires_at, i.accepted_at
  from invites i
  join teams t on t.id = i.team_id
  where i.token = p_token
    and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

grant execute on function preview_invite(uuid) to authenticated;
