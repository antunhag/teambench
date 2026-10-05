-- Troca o modelo de aptidão de "lista ordenada de até 4 vagas" (0013) para
-- classificação independente nas 4 vagas fixas: cada par (atleta, vaga)
-- agora tem sua própria `quality` — A (primeira opção), B (rotação),
-- C (apoio), ou null (vaga habitual, ainda sem classificar). Ausência de
-- linha pra uma vaga continua significando "não é vaga habitual" — isso não
-- muda; só fica mais rico o que uma linha PRESENTE representa. Diferença
-- central vs. o modelo antigo: vários atletas podem ser A na mesma vaga ao
-- mesmo tempo (lá era um ranking único por atleta).
--
-- `priority` desaparece — não faz sentido nesse modelo. Dropar a coluna já
-- derruba sozinho a constraint "unique (player_id, priority)" (ela depende
-- só dessa coluna, na mesma tabela — não precisa de CASCADE nem de acertar
-- o nome gerado automaticamente). unique (player_id, slot_type) continua de
-- pé: ainda não faz sentido duas linhas pra mesma vaga do mesmo atleta.
--
-- Linhas já cadastradas (Martim S, Marcelo G) preservam seu slot_type —
-- continuam "vaga habitual" — e ganham quality = null automaticamente, que
-- é exatamente "habitual mas ainda sem classificar". Nenhum backfill
-- necessário.

alter table player_aptitudes drop column priority;
alter table player_aptitudes add column quality text check (quality is null or quality in ('A', 'B', 'C'));
