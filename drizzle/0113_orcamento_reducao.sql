-- CUBO novo: Valor Redução (corte na dotação) e Qtd Empenho. Aditiva; os orçamentos já gravados ficam com 0 até o reenvio.
ALTER TABLE `orcamento_itens` ADD `valor_reducao` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orcamento_itens` ADD `qtd_empenho` integer DEFAULT 0 NOT NULL;
