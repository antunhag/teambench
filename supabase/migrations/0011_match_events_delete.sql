-- Eventos eram só-acrescenta por desenho (nenhuma política de DELETE) —
-- desfazer sempre virava um novo evento, nunca uma remoção de verdade.
-- O corretor pós-jogo (MatchEventEditor) precisa poder remover um lance
-- duplicado/errado de vez (ex.: reconstruindo uma parte que só tinha
-- lances presos em ms=0 por causa do bug do botão "Iniciar Parte N", e
-- os originais quebrados precisam sair depois de recriados com o tempo
-- certo). Isto é a ação mais irreversível deste editor, então fica restrita
-- só ao Admin da Equipa — nunca a Lançador de dados.
create policy match_events_delete_admin on match_events for delete
  using (has_team_role(team_id, array['team_admin']::team_role[]));
