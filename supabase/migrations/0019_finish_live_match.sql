-- Marcar um jogo como terminado (matches.status = 'finished') precisava de
-- UPDATE direto na tabela matches, mas a policy matches_update_coach
-- (migração 0004) só permite team_admin — um Lançador de dados (o papel que
-- mais regista jogos ao vivo do início ao fim) nunca conseguia marcar um
-- jogo como terminado, nem pelo botão manual em MatchSummary.tsx nem por
-- deteção automática: a RLS bloqueava silenciosamente (o botão já mostrava
-- "Não consegui marcar como terminado — tente de novo", mas tentar de novo
-- nunca resolvia, porque o problema era permissão, não rede).
--
-- Mesmo padrão de claim_live_match/release_live_match (migração 0009):
-- SECURITY DEFINER, gate em has_team_role(['team_admin', 'data_entry']) —
-- quem pode registar um jogo ao vivo também pode marcá-lo como terminado.

create or replace function finish_live_match(p_match_id uuid)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m matches;
begin
  select * into m from matches where id = p_match_id;
  if m is null then
    raise exception 'match_not_found';
  end if;
  if not has_team_role(m.team_id, array['team_admin', 'data_entry']::team_role[]) then
    raise exception 'not_authorized';
  end if;

  -- "and status = 'live'" não é estritamente necessário hoje (status é só
  -- de apresentação, nada mais depende dele) — fica como defesa barata: se
  -- um dia status ganhar alguma consequência real, ou se esta função for
  -- chamada de algum caminho novo sem o mesmo cuidado de
  -- useLiveMatch.ts (só chama quando state.finished é true), isto evita
  -- "terminar" um jogo que ainda nem começou.
  update matches
  set status = 'finished'
  where id = p_match_id and status = 'live'
  returning * into m;

  if not found then
    select * into m from matches where id = p_match_id;
  end if;

  return m;
end;
$$;

grant execute on function finish_live_match(uuid) to authenticated;
