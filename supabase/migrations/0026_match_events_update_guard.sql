-- match_events é pensado para ser só-acrescenta (ver nota em 0001 e o DELETE
-- restrito a team_admin em 0011) — correções entram como eventos novos ou
-- flags, nunca reescrevendo o passado em silêncio. Mas a policy de UPDATE
-- (match_events_update_sync, 0005) só checa QUEM está a fazer o UPDATE
-- (team_admin/data_entry), nunca O QUE mudou. Ela existe só para destravar
-- o reenvio idempotente da fila offline depois de uma queda de rede
-- (useOutboxSync.ts: o mesmo upsert()/onConflict vira UPDATE aos olhos do
-- Postgres) — o comentário da própria 0005 já assumia "o cliente sempre
-- reenvia os mesmos dados", mas nunca impôs isso.
--
-- Na prática isto significa que qualquer conta data_entry/team_admin,
-- fazendo um UPDATE direto na API (por fora da tela "Corrigir registo"),
-- consegue reescrever QUALQUER campo de QUALQUER evento já registado sem
-- deixar marca nenhuma — contornando a restrição de DELETE (admin-only) por
-- outra via: não precisa apagar pra apagar a verdade, basta sobrescrever.
-- Achado da primeira auditoria de segurança (2026-10-07, docs/SECURITY.md),
-- deliberadamente adiado até este desenho.
--
-- Fix: esta trigger só deixa um UPDATE passar quando
--  (a) os campos que importam pro jogo ficam idênticos ao que já existia —
--      reenvio de verdade. O outbox local (outbox.ts/useOutboxSync.ts)
--      guarda o MESMO objeto em localStorage e reenvia-o sem o recalcular
--      até sincronizar com sucesso, então um reenvio legítimo nunca muda
--      nada aqui; ou
--  (b) o NOVO payload traz `correcao: true` — correção explícita. A Registo
--      (MatchEventEditor.tsx) passa a incluir sempre essa flag ao salvar
--      uma correção.
-- Qualquer outra mudança é rejeitada. Isto não distingue "pela tela da
-- Registo" de "por fora dela" (RLS/triggers nunca conseguem — quem tem o
-- papel certo tem a mesma API de qualquer jeito); só exige que toda mudança
-- real se autodeclare como correção, fechando a reescrita silenciosa e sem
-- marca nenhuma.
--
-- Revisado pelo security-auditor antes de aplicar (Princípio II da
-- constituição).

create or replace function guard_match_events_update()
returns trigger
language plpgsql
as $$
begin
  if new.match_id is distinct from old.match_id
    or new.team_id is distinct from old.team_id
    or new.type is distinct from old.type
    or new.player_id is distinct from old.player_id
    or new.payload is distinct from old.payload
    or new.ms is distinct from old.ms
    or new.min is distinct from old.min
    or new.sec is distinct from old.sec
    or new.period is distinct from old.period
  then
    if not coalesce((new.payload->>'correcao')::boolean, false) then
      raise exception 'match_events: UPDATE que muda dado precisa de payload.correcao = true (correção explícita), ou ser idêntico ao existente (reenvio idempotente)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists match_events_update_guard on match_events;
create trigger match_events_update_guard
  before update on match_events
  for each row execute function guard_match_events_update();
