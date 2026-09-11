CREATE TABLE `configuracoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dados` text DEFAULT '{}' NOT NULL,
	`atualizado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT OR IGNORE INTO `configuracoes` (`id`, `dados`) VALUES (1, '{}');
