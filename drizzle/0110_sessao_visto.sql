-- Encerrar sessões inativas: a última atividade de cada sessão (as antigas partem do login).
ALTER TABLE sessoes ADD COLUMN visto_em text;
UPDATE sessoes SET visto_em = COALESCE(criado_em, CURRENT_TIMESTAMP);
