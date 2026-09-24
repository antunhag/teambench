-- Trava de "quem está a registar este jogo agora" — evita que duas pessoas
-- diferentes (dois Lançadores de dados, ou um Admin e um Lançador) tentem
-- registar eventos no mesmo jogo ao vivo ao mesmo tempo. O plano original já
-- tinha identificado esse risco e adiava para "aviso simples" — isto
-- substitui o aviso por uma trava de verdade quando há rede.
--
-- A trava é por UTILIZADOR, não por aparelho/aba: se o mesmo utilizador
-- reabrir o jogo noutro telemóvel (o dele morreu a meio do jogo, por
-- exemplo), continua a poder editar sem esperar nada — o cenário que a
-- trava impede é duas CONTAS diferentes editando o mesmo jogo.
--
-- Offline: quem abre um jogo sem rede não consegue verificar/reivindicar a
-- trava — assume-se dono local (como já era o comportamento antes disto) e
-- a reivindicação acontece quando a rede voltar. Isto é consciente: é mais
-- importante um treinador conseguir registar o jogo em campo sem sinal do
-- que bloquear por causa de uma trava que ele não consegue nem consultar.

alter table matches add column live_holder_id uuid references auth.users(id);
alter table matches add column live_holder_heartbeat_at timestamptz;

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

  -- Reivindica se: ninguém segura a trava, já sou eu quem segura (renovação
  -- do heartbeat), ou quem segurava sumiu há mais de 45s (aparelho
  -- desligou/fechou sem libertar) — esse limiar dá folga a dois ciclos de
  -- heartbeat (20s cada) sem deixar a trava presa para sempre.
  update matches
  set live_holder_id = auth.uid(),
      live_holder_heartbeat_at = now(),
      status = case when status = 'scheduled' then 'live' else status end
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

grant execute on function claim_live_match(uuid) to authenticated;

create or replace function release_live_match(p_match_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update matches
  set live_holder_id = null, live_holder_heartbeat_at = null
  where id = p_match_id and live_holder_id = auth.uid();
$$;

grant execute on function release_live_match(uuid) to authenticated;
