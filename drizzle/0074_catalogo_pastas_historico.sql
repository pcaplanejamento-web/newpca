-- CATÁLOGO — PASTAS + dois TIPOS de catálogo (aditiva):
--  * `catalogo_pastas`: pastas GLOBAIS (o catálogo não tem grupo) que agrupam catálogos; excluir a pasta só a tira
--    (os catálogos voltam à grade — FK set null).
--  * `catalogos.tipo`: 'agenda' (Catálogo da Agenda — o de sempre: itens com código ÚNICO GLOBAL) | 'historico'
--    (Histórico de compra — os contratos e itens comprados, exportados do sistema de compras). Os atuais = 'agenda'.
--  * `catalogos.cor` (a capa do card; NULL = a cor padrão do tipo) e `catalogos.pasta_id`.
--  * `catalogo_contratos` (um por "Id Contrato" do arquivo) + `catalogo_compras` (uma linha por item contratado — o
--    mesmo produto pode aparecer em vários contratos: NÃO entra na unicidade do código dos itens da agenda).
CREATE TABLE `catalogo_pastas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor` text DEFAULT '#2563EB' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_por` integer REFERENCES `usuarios`(`id`) ON DELETE set null,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
ALTER TABLE `catalogos` ADD `tipo` text DEFAULT 'agenda' NOT NULL;
--> statement-breakpoint
ALTER TABLE `catalogos` ADD `cor` text;
--> statement-breakpoint
ALTER TABLE `catalogos` ADD `pasta_id` integer REFERENCES `catalogo_pastas`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `catalogos_pasta_idx` ON `catalogos` (`pasta_id`);
--> statement-breakpoint
CREATE TABLE `catalogo_contratos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalogo_id` integer NOT NULL REFERENCES `catalogos`(`id`) ON DELETE cascade,
	`id_contrato` text NOT NULL,
	`numero_contrato` text,
	`id_licitacao` text,
	`numero_licitacao` text,
	`orgao` text,
	`unidade_gestora` text,
	`credor` text,
	`valor_contrato` real,
	`data_assinatura` text,
	`data_publicacao` text,
	`modalidade` text,
	`protocolo` text,
	`objeto` text,
	`natureza` text,
	`detalhamento` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalogo_contratos_uq` ON `catalogo_contratos` (`catalogo_id`,`id_contrato`);
--> statement-breakpoint
CREATE TABLE `catalogo_compras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalogo_id` integer NOT NULL REFERENCES `catalogos`(`id`) ON DELETE cascade,
	`ordem` integer NOT NULL,
	`id_contrato` text NOT NULL,
	`processo` text,
	`codigo` text NOT NULL,
	`sequencial` integer,
	`descricao` text NOT NULL,
	`qtd_contratada` real,
	`qtd_aditada` real,
	`qtd_empenhada` real,
	`qtd_of_empenhar` real,
	`saldo_empenhar` real,
	`valor_unitario` real,
	`valor_contratado` real,
	`valor_empenhado` real,
	`saldo_valor_empenhar` real,
	`qtd_liquidada` real,
	`qtd_liquidada_anulada` real,
	`qtd_empenhada_anulada` real,
	`saldo_liquidar` real
);
--> statement-breakpoint
CREATE INDEX `catalogo_compras_cat_idx` ON `catalogo_compras` (`catalogo_id`,`ordem`);
--> statement-breakpoint
CREATE INDEX `catalogo_compras_codigo_idx` ON `catalogo_compras` (`codigo`);
