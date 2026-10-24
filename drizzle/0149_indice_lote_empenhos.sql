-- Excluir uma importação (centi_lotes) zera o `lote_id` dos empenhos e das liquidações que ela gravou e confere as chaves
-- estrangeiras dessas tabelas: sem índice no `lote_id`, cada importação excluída varria as tabelas inteiras.
CREATE INDEX `empenhos_lote_idx` ON `empenhos` (`lote_id`);
--> statement-breakpoint
CREATE INDEX `liquidacoes_lote_idx` ON `liquidacoes` (`lote_id`);
