DROP TABLE IF EXISTS `protocolo_opcoes`;
--> statement-breakpoint
DROP TABLE IF EXISTS `protocolos`;
--> statement-breakpoint
CREATE TABLE `protocolos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` text NOT NULL,
	`data` text,
	`orgao` text,
	`orgao_sigla` text,
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
--> statement-breakpoint
CREATE INDEX `protocolos_data_idx` ON `protocolos` (`data`);
--> statement-breakpoint
CREATE TABLE `protocolo_opcoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campo` text NOT NULL,
	`valor` text NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `protocolo_opcoes_uq` ON `protocolo_opcoes` (`campo`,`valor`);
--> statement-breakpoint
INSERT INTO `protocolo_opcoes` (`campo`,`valor`,`ordem`) VALUES ('natureza','INCLUSÃO 2027',0),('natureza','INCLUSÃO 2026',1),('natureza','EXCLUSÃO',2),('natureza','CORREÇÃO',3),('natureza','COMUNICAÇÃO INTERNA',4),('responsavel','NATY',0),('responsavel','CRIS',1),('responsavel','MARIA',2);
