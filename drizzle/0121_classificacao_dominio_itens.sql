-- v1.147.0 — CLASSIFICAÇÃO (do Catálogo) e DOMÍNIO GRAVADOS em todo item (DFD e planilha); o domínio da classificação.
ALTER TABLE `item_classificacoes` ADD `dominio` text;
--> statement-breakpoint
ALTER TABLE `dfd_itens` ADD `classificacao` text;
--> statement-breakpoint
ALTER TABLE `dfd_itens` ADD `dominio` text;
--> statement-breakpoint
ALTER TABLE `dfd_itens` ADD `classificado_versao` text;
--> statement-breakpoint
ALTER TABLE `itens` ADD `classificacao_cat` text;
--> statement-breakpoint
ALTER TABLE `itens` ADD `dominio_cat` text;
--> statement-breakpoint
ALTER TABLE `itens` ADD `classificado_versao` text;
--> statement-breakpoint
CREATE INDEX `dfd_itens_classificado_idx` ON `dfd_itens` (`classificado_versao`);
--> statement-breakpoint
CREATE INDEX `itens_classificado_idx` ON `itens` (`classificado_versao`);
