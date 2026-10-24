-- LIQUIDAÇÕES da Centi dentro dos cards de empenhos (aditiva). O lote ganha o órgão da Centi pedido (`id_orgao_centi`:
-- a API de liquidações exige o órgão e não pagina — uma importação = um lote por órgão, `modo` 'liquidacoes').
-- A liquidação SÓ é gravada quando o EMPENHO dela está no card (`empenho_id` cascade: o empenho que sai leva as
-- liquidações; o vínculo — órgão e unidade do cadastro — é sempre o do empenho).
ALTER TABLE `centi_lotes` ADD `id_orgao_centi` integer;
--> statement-breakpoint
CREATE TABLE `liquidacoes_staging` (
	`lote_id` integer NOT NULL REFERENCES `centi_lotes`(`id`) ON DELETE cascade,
	`pagina` integer NOT NULL,
	`chave` text NOT NULL,
	`ano` integer NOT NULL,
	`src_id` integer,
	`numero` text,
	`data` text,
	`numero_empenho` text NOT NULL,
	`orgao` text NOT NULL DEFAULT '',
	`credor` text,
	`cpf_cnpj` text,
	`historico` text,
	`valor` real NOT NULL DEFAULT 0,
	`valor_anulado` real NOT NULL DEFAULT 0,
	`valor_liquido` real NOT NULL DEFAULT 0,
	`valor_pago` real NOT NULL DEFAULT 0,
	`saldo` real NOT NULL DEFAULT 0,
	PRIMARY KEY (`lote_id`, `chave`)
);
--> statement-breakpoint
CREATE TABLE `liquidacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chave` text NOT NULL,
	`ano` integer NOT NULL,
	`src_id` integer,
	`numero` text,
	`data` text,
	`numero_empenho` text NOT NULL,
	`orgao` text NOT NULL DEFAULT '',
	`credor` text,
	`cpf_cnpj` text,
	`historico` text,
	`valor` real NOT NULL DEFAULT 0,
	`valor_anulado` real NOT NULL DEFAULT 0,
	`valor_liquido` real NOT NULL DEFAULT 0,
	`valor_pago` real NOT NULL DEFAULT 0,
	`saldo` real NOT NULL DEFAULT 0,
	`id_orgao_centi` integer NOT NULL,
	`empenho_id` integer NOT NULL REFERENCES `empenhos`(`id`) ON DELETE cascade,
	`card_id` integer NOT NULL REFERENCES `empenho_cards`(`id`) ON DELETE cascade,
	`lote_id` integer REFERENCES `centi_lotes`(`id`) ON DELETE set null,
	`removido_em` text,
	`leitor` integer NOT NULL DEFAULT 0,
	`criado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `liquidacoes_card_chave_uq` ON `liquidacoes` (`card_id`, `chave`);
--> statement-breakpoint
CREATE INDEX `liquidacoes_card_ano_idx` ON `liquidacoes` (`card_id`, `ano`, `id_orgao_centi`, `removido_em`);
--> statement-breakpoint
CREATE INDEX `liquidacoes_empenho_idx` ON `liquidacoes` (`empenho_id`);
--> statement-breakpoint
CREATE INDEX `empenhos_card_numero_idx` ON `empenhos` (`card_id`, `orgao_gestor`, `numero`);
