CREATE TABLE `unidades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`municipio` text NOT NULL,
	`nome_arquivo` text,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`total_itens` integer DEFAULT 0,
	`valor_total` real DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unidades_codigo_uq` ON `unidades` (`codigo`);
--> statement-breakpoint
CREATE TABLE `itens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`unidade_id` integer NOT NULL,
	`id_produto` text,
	`sequencial` integer,
	`nome_produto` text,
	`unidade_medida` text,
	`unidade_medida_norm` text,
	`quantidade` real,
	`valor_referencia` real,
	`valor_total` real,
	`classificacao` text,
	`classificacao_norm` text,
	`data_desejada` text,
	`mes_desejado` integer,
	`ano_desejado` integer,
	FOREIGN KEY (`unidade_id`) REFERENCES `unidades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `itens_unidade_idx` ON `itens` (`unidade_id`);
--> statement-breakpoint
CREATE INDEX `itens_class_idx` ON `itens` (`classificacao_norm`);
--> statement-breakpoint
CREATE INDEX `itens_periodo_idx` ON `itens` (`ano_desejado`,`mes_desejado`);
