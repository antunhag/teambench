-- Nome curto do clube (ex.: "AAL" para "Académica de Leça") para usar no
-- lugar de "Nós" no jogo ao vivo — o app serve vários clubes, então o rótulo
-- não pode ficar fixo no código.
alter table clubs add column short_name text;

-- Qualquer membro da equipa (não só quem administra o clube) precisa ver o
-- rótulo do próprio clube durante o jogo — um Lançador de dados convidado só
-- para a equipa nunca é club_member, e a política de clubs_select_member já
-- existente não cobre esse caso. Em vez de afrouxar aquela política (que
-- existe para não vazar dados de clubes de outras equipas), expomos só o
-- necessário via função SECURITY DEFINER, mesmo padrão de preview_invite().
create or replace function team_club_label(p_team_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(c.short_name, c.name)
  from teams t
  join clubs c on c.id = t.club_id
  where t.id = p_team_id
    and t.id in (select my_team_ids());
$$;

grant execute on function team_club_label(uuid) to authenticated;
