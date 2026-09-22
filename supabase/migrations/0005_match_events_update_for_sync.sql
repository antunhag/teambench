-- A sincronização usa upsert (onConflict: client_event_id) para ser segura
-- em caso de reenvio depois de uma conexão cair a meio de uma resposta —
-- sem isso, o mesmo evento reenviado duas vezes poderia duplicar. O caminho
-- "já existe, atualiza" do upsert é tecnicamente um UPDATE aos olhos do
-- Postgres, e match_events só tinha política de INSERT — então um reenvio
-- ficava preso para sempre (RLS barra o UPDATE, o item nunca sai da fila
-- local). Isto não abre a porta a editar eventos livremente: o cliente
-- sempre reenvia os mesmos dados para o mesmo client_event_id, nunca dados
-- diferentes — o UPDATE na prática é sempre um no-op de idempotência.
create policy match_events_update_sync on match_events for update
  using (has_team_role(team_id, array['team_admin','data_entry']::team_role[]))
  with check (has_team_role(team_id, array['team_admin','data_entry']::team_role[]));
