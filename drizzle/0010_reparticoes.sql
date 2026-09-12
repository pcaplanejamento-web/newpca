CREATE TABLE `reparticoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`nome` text NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `reparticoes_ordem_idx` ON `reparticoes` (`ordem`);
--> statement-breakpoint
CREATE TABLE `grupo_reparticoes` (
	`grupo_id` integer NOT NULL,
	`reparticao_id` integer NOT NULL,
	PRIMARY KEY(`grupo_id`, `reparticao_id`),
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reparticao_id`) REFERENCES `reparticoes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT OR IGNORE INTO `reparticoes` (`id`, `codigo`, `nome`, `ordem`) VALUES (1, 'GERAL', 'Geral', 0);
--> statement-breakpoint
INSERT OR IGNORE INTO `grupo_reparticoes` (`grupo_id`, `reparticao_id`) SELECT `id`, 1 FROM `grupos`;
