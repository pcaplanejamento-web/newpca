CREATE TABLE `dfd_protocolos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` text NOT NULL,
	`data` text,
	`interessado` text,
	`documento` text,
	`assunto` text,
	`observacao` text,
	`valor_capa` real,
	`reparticao_id` integer,
	`local_reparticao` text,
	`nome_arquivo` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`reparticao_id`) REFERENCES `reparticoes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `protocolos_dfd_numero_uq` ON `dfd_protocolos` (`numero`);
--> statement-breakpoint
CREATE INDEX `protocolos_dfd_reparticao_idx` ON `dfd_protocolos` (`reparticao_id`);
--> statement-breakpoint
ALTER TABLE `dfds` ADD `protocolo_id` integer REFERENCES dfd_protocolos(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `dfds_protocolo_idx` ON `dfds` (`protocolo_id`);
