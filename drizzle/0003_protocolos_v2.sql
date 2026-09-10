DROP TABLE IF EXISTS `protocolos`;
--> statement-breakpoint
CREATE TABLE `protocolos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data` text,
	`numero` text NOT NULL,
	`secretaria` text,
	`natureza` text,
	`responsavel` text,
	`situacao` text DEFAULT 'em_analise' NOT NULL,
	`distribuicao` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `protocolos_situacao_idx` ON `protocolos` (`situacao`);
--> statement-breakpoint
CREATE INDEX `protocolos_natureza_idx` ON `protocolos` (`natureza`);
--> statement-breakpoint
CREATE INDEX `protocolos_responsavel_idx` ON `protocolos` (`responsavel`);
