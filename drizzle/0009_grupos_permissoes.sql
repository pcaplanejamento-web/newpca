CREATE TABLE `permissoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`abas` text DEFAULT '[]' NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `grupos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`permissao_id` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`permissao_id`) REFERENCES `permissoes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `usuario_grupos` (
	`usuario_id` integer NOT NULL,
	`grupo_id` integer NOT NULL,
	PRIMARY KEY(`usuario_id`, `grupo_id`),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `protocolos` ADD `grupo_id` integer REFERENCES grupos(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `protocolo_opcoes` ADD `grupo_id` integer REFERENCES grupos(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `protocolos_grupo_idx` ON `protocolos` (`grupo_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `permissoes` (`id`, `nome`, `abas`) VALUES (1, 'Completo', '["dashboard","protocolos","pca"]');
--> statement-breakpoint
INSERT OR IGNORE INTO `grupos` (`id`, `nome`, `permissao_id`) VALUES (1, 'Geral', 1);
--> statement-breakpoint
UPDATE `protocolos` SET `grupo_id` = 1 WHERE `grupo_id` IS NULL;
--> statement-breakpoint
UPDATE `protocolo_opcoes` SET `grupo_id` = 1 WHERE `grupo_id` IS NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `usuario_grupos` (`usuario_id`, `grupo_id`) SELECT `id`, 1 FROM `usuarios`;
--> statement-breakpoint
DROP INDEX IF EXISTS `protocolo_opcoes_uq`;
--> statement-breakpoint
CREATE UNIQUE INDEX `protocolo_opcoes_uq` ON `protocolo_opcoes` (`campo`, `valor`, `grupo_id`);
