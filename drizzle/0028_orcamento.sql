-- Módulo ORÇAMENTO (relatório CUBO): orcamentos (nome + ano) + orcamento_itens
-- (lançamentos: Órgão/Unidade/Elemento + valores). Somente leitura. Aditiva; concede a
-- aba `orcamento` a quem já vê o `catalogo` (admin sempre vê).
CREATE TABLE `orcamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`ano` integer NOT NULL,
	`total_itens` integer DEFAULT 0 NOT NULL,
	`valor_inicial` real DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `orcamento_itens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`orcamento_id` integer NOT NULL,
	`orgao` text,
	`unidade` text,
	`nome_elemento` text,
	`codigo_elemento` text,
	`valor_emenda_impositiva` real DEFAULT 0 NOT NULL,
	`valor_inicial` real DEFAULT 0 NOT NULL,
	`valor_suplementacao` real DEFAULT 0 NOT NULL,
	`valor_empenho` real DEFAULT 0 NOT NULL,
	`saldo` real DEFAULT 0 NOT NULL,
	`valor_anulacao` real DEFAULT 0 NOT NULL,
	`sequencial` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`orcamento_id`) REFERENCES `orcamentos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `orcamento_itens_orcamento_idx` ON `orcamento_itens` (`orcamento_id`);
--> statement-breakpoint
UPDATE `permissoes` SET `abas` = json_insert(`abas`, '$[#]', 'orcamento') WHERE `abas` LIKE '%"catalogo"%' AND `abas` NOT LIKE '%"orcamento"%';
