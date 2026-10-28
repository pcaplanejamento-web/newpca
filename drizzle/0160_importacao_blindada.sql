-- v1.238.0 — Importações da Centi blindadas (leituras baratas e um lote lendo por card).
-- O lote em andamento de cada card e a última importação concluída: sem varrer o histórico dos lotes.
CREATE INDEX IF NOT EXISTS `centi_lotes_card_estado_idx` ON `centi_lotes` (`card_id`, `estado`, `concluido_em`);
--> statement-breakpoint
-- A versão das importações (o último lote promovido) num passo só.
CREATE INDEX IF NOT EXISTS `centi_lotes_estado_idx` ON `centi_lotes` (`estado`, `id`);
--> statement-breakpoint
-- O rótulo da unidade (sigla repetida em outra unidade) sem percorrer as unidades a cada linha.
CREATE INDEX IF NOT EXISTS `reparticoes_codigo_idx` ON `reparticoes` (`codigo`);
--> statement-breakpoint
-- Dois lotes LENDO no mesmo card (a aba e a automática começando ao mesmo tempo): fica o mais novo.
UPDATE `centi_lotes` SET `estado` = 'falhou', `mensagem` = 'Encerrado: havia outra importação em andamento no card.', `concluido_em` = CURRENT_TIMESTAMP
WHERE `estado` = 'lendo' AND `id` < (SELECT MAX(l2.`id`) FROM `centi_lotes` l2 WHERE l2.`card_id` = `centi_lotes`.`card_id` AND l2.`estado` = 'lendo');
--> statement-breakpoint
-- Um lote LENDO por card, garantido no banco.
CREATE UNIQUE INDEX IF NOT EXISTS `centi_lotes_um_lendo_uq` ON `centi_lotes` (`card_id`) WHERE `estado` = 'lendo';
