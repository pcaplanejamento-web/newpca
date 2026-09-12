CREATE TABLE `dfds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` text NOT NULL,
	`planejamento` text,
	`tipo` text,
	`objeto` text,
	`orgao_entidade` text,
	`setor_requisitante` text,
	`sigla_setor` text,
	`reparticao_id` integer,
	`responsavel` text,
	`valor_estimado` real,
	`nome_arquivo` text,
	`total_itens` integer DEFAULT 0,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`reparticao_id`) REFERENCES `reparticoes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dfds_numero_uq` ON `dfds` (`numero`);
--> statement-breakpoint
CREATE INDEX `dfds_reparticao_idx` ON `dfds` (`reparticao_id`);
--> statement-breakpoint
CREATE TABLE `dfd_itens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dfd_id` integer NOT NULL,
	`item` integer,
	`codigo` text,
	`descricao` text,
	`unidade` text,
	`quantidade` real,
	`sequencial` integer,
	FOREIGN KEY (`dfd_id`) REFERENCES `dfds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dfd_itens_dfd_idx` ON `dfd_itens` (`dfd_id`);
--> statement-breakpoint
CREATE TABLE `pcas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`ano` integer,
	`observacao` text,
	`total_dfds` integer DEFAULT 0,
	`total_itens` integer DEFAULT 0,
	`valor_estimado` real DEFAULT 0,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `pca_dfds` (
	`pca_id` integer NOT NULL,
	`dfd_id` integer NOT NULL,
	PRIMARY KEY(`pca_id`, `dfd_id`),
	FOREIGN KEY (`pca_id`) REFERENCES `pcas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dfd_id`) REFERENCES `dfds`(`id`) ON UPDATE no action ON DELETE cascade
);
