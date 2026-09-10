CREATE TABLE `protocolo_opcoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoria` text NOT NULL,
	`valor` text NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `protocolo_opcoes_uq` ON `protocolo_opcoes` (`categoria`,`valor`);
--> statement-breakpoint
INSERT INTO `protocolo_opcoes` (`categoria`,`valor`) VALUES
	('natureza','INCLUSÃO 2027'),
	('natureza','INCLUSÃO 2026'),
	('natureza','EXCLUSÃO');
