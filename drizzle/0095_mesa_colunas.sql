-- COLUNAS DA MESA criadas pelas automações (o nó "Gravar na coluna da Mesa"): a coluna por entidade (protocolo, DFD ou item)
-- e o valor por registro. Aditiva.
CREATE TABLE `mesa_colunas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entidade` text NOT NULL,
	`nome` text NOT NULL,
	`chave` text NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mesa_colunas_uq` ON `mesa_colunas` (`entidade`,`chave`);
--> statement-breakpoint
CREATE TABLE `mesa_colunas_valores` (
	`coluna_id` integer NOT NULL,
	`alvo_id` integer NOT NULL,
	`valor` text NOT NULL,
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	PRIMARY KEY(`coluna_id`, `alvo_id`),
	FOREIGN KEY (`coluna_id`) REFERENCES `mesa_colunas`(`id`) ON UPDATE no action ON DELETE cascade
);
