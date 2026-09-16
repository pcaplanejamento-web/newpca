-- Catálogo de produtos: base de REFERÊNCIA para padronização de itens. Um catálogo
-- (importado de PDF) tem itens com CÓDIGO (único GLOBAL), DESCRIÇÃO e UNIDADE de
-- medida; cada item guarda os TIPOS de DFD a que se aplica (JSON). Base ISOLADA —
-- NÃO referencia PCA/DFD/itens: serve só para consulta e para a comparação futura.
-- Excluir o catálogo apaga seus itens (cascade).
CREATE TABLE `catalogos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`tipos_padrao` text DEFAULT '[]' NOT NULL,
	`total_itens` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `catalogo_itens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalogo_id` integer NOT NULL,
	`codigo` text NOT NULL,
	`codigo_raw` text,
	`descricao` text NOT NULL,
	`unidade` text,
	`sequencial` integer,
	`tipos` text DEFAULT '[]' NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`catalogo_id`) REFERENCES `catalogos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `catalogo_itens_catalogo_idx` ON `catalogo_itens` (`catalogo_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalogo_itens_codigo_uq` ON `catalogo_itens` (`codigo`);
--> statement-breakpoint
UPDATE `permissoes` SET `abas` = json_insert(`abas`, '$[#]', 'catalogo') WHERE `abas` LIKE '%"dfd"%' AND `abas` NOT LIKE '%"catalogo"%';
