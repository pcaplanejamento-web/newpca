-- TABELAS das automações (o nó "Salvar em tabela"): dados guardados por um fluxo para ver e usar em outros. Aditiva.
CREATE TABLE `automacao_tabelas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`chave` text NOT NULL,
	`colunas` text NOT NULL DEFAULT '[]',
	`linhas` text NOT NULL DEFAULT '[]',
	`total` integer NOT NULL DEFAULT 0,
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_por` integer,
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automacao_tabelas_chave_uq` ON `automacao_tabelas` (`chave`);
