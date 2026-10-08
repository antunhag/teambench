-- claim_live_match (migração 0009) marcava matches.status = 'live' assim
-- que alguém reivindicava a trava de edição — ou seja, só por ABRIR a tela
-- do jogo, mesmo sem tocar em nada. Isso nunca foi visível antes porque
-- não havia nenhuma etiqueta na UI a refletir o status; passou a ser um
-- problema real na migração 0018x/MatchHub (consolidação do ponto de
-- entrada do jogo): "Planear rotações" costumava ser um botão próprio, sem
-- tocar na trava do jogo ao vivo nenhuma; agora vive como aba dentro do
-- mesmo ecrã, que por omissão já monta a aba "Jogo" primeiro — então só
-- espreitar as rotações de um jogo que nem começou já reivindicava a trava
-- e marcava "live" como efeito colateral, mesmo sem o treinador ter
-- carregado em "Iniciar Parte 1".
--
-- Corrigido separando as duas coisas: claim_live_match volta a SÓ
-- reivindicar a trava (não mexe mais em status); start_live_match (novo,
-- mesmo padrão de autorização) marca 'live' só quando o jogo realmente
-- começa de verdade — chamado a partir de state.started (motor puro,
-- replay dos eventos), nunca só por abrir a tela.

create or replace function claim_live_match(p_match_id uuid)
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

  update matches
  set live_holder_id = auth.uid(),
      live_holder_heartbeat_at = now()
  where id = p_match_id
    and (
      live_holder_id is null
      or live_holder_id = auth.uid()
      or live_holder_heartbeat_at < now() - interval '45 seconds'
    )
  returning * into m;

  if not found then
    select * into m from matches where id = p_match_id;
  end if;

  return m;
end;
$$;

create or replace function start_live_match(p_match_id uuid)
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

  update matches
  set status = 'live'
  where id = p_match_id and status = 'scheduled'
  returning * into m;

  if not found then
    select * into m from matches where id = p_match_id;
  end if;

  return m;
end;
$$;

grant execute on function start_live_match(uuid) to authenticated;
