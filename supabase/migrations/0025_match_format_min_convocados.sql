-- Mínimo esperado de convocados por Formato de Jogo — specs/007-convocados-sync/
-- User Story 3. Opcional (null = sem aviso configurado, comportamento de
-- hoje, nada muda): o treinador pode definir, por formato/competição, quantos
-- atletas espera ter convocados; marcar menos do que isso num jogo desse
-- formato mostra um aviso não-bloqueante em PreMatch.tsx, dando a chance de
-- reparar num esquecimento antes do apito.
--
-- Sem CHECK constraint (consistente com as outras colunas numéricas desta
-- tabela, como period_count/period_minutes, que também não têm) — validar um
-- valor sem sentido (ex. negativo) é responsabilidade da UI de edição do
-- formato, não do banco.

alter table match_formats add column min_convocados int;
