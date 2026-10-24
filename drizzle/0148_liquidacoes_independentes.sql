-- LIQUIDAÇÕES INDEPENDENTES dos empenhos. O card de liquidações tem os PRÓPRIOS órgãos (`liquidacao_card_orgaos`: o órgão
-- do cadastro — o "ID na Centi" dele é o `idOrgao` do pedido, um órgão por importação — e, opcional, a unidade de
-- destino). A liquidação grava o órgão e a unidade dela (do órgão do card); a ligação com o empenho e o card de origem
-- saem (`empenho_cards.origem_id` fica DORMENTE, sempre NULL — uma coluna com chave estrangeira não sai no SQLite).
CREATE TABLE `liquidacao_card_orgaos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL REFERENCES `empenho_cards`(`id`) ON DELETE cascade,
	`orgao_id` integer NOT NULL REFERENCES `orgaos`(`id`) ON DELETE cascade,
	`reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `liquidacao_card_orgaos_uq` ON `liquidacao_card_orgaos` (`card_id`, `orgao_id`);
--> statement-breakpoint
-- Os órgãos que o card já pedia: os de destino dos vínculos do card de origem.
INSERT OR IGNORE INTO `liquidacao_card_orgaos` (`card_id`, `orgao_id`)
SELECT DISTINCT c.`id`, v.`orgao_id` FROM `empenho_cards` c JOIN `empenho_card_vinculos` v ON v.`card_id` = c.`origem_id` WHERE c.`tipo` = 'liquidacoes';
--> statement-breakpoint
CREATE TABLE `liquidacoes_nova` (
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
	`orgao_id` integer NOT NULL REFERENCES `orgaos`(`id`) ON DELETE cascade,
	`reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE cascade,
	`card_id` integer NOT NULL REFERENCES `empenho_cards`(`id`) ON DELETE cascade,
	`lote_id` integer REFERENCES `centi_lotes`(`id`) ON DELETE set null,
	`removido_em` text,
	`leitor` integer NOT NULL DEFAULT 0,
	`criado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
INSERT INTO `liquidacoes_nova` (`id`, `chave`, `ano`, `src_id`, `numero`, `data`, `numero_empenho`, `orgao`, `credor`, `cpf_cnpj`, `historico`, `valor`, `valor_anulado`, `valor_liquido`, `valor_pago`, `saldo`, `id_orgao_centi`, `orgao_id`, `reparticao_id`, `card_id`, `lote_id`, `removido_em`, `leitor`, `criado_em`, `atualizado_em`)
SELECT l.`id`, l.`chave`, l.`ano`, l.`src_id`, l.`numero`, l.`data`, l.`numero_empenho`, l.`orgao`, l.`credor`, l.`cpf_cnpj`, l.`historico`, l.`valor`, l.`valor_anulado`, l.`valor_liquido`, l.`valor_pago`, l.`saldo`, l.`id_orgao_centi`,
  e.`orgao_id`, e.`reparticao_id`, l.`card_id`, l.`lote_id`, l.`removido_em`, l.`leitor`, l.`criado_em`, l.`atualizado_em`
FROM `liquidacoes` l JOIN `empenhos` e ON e.`id` = l.`empenho_id`;
--> statement-breakpoint
DROP TABLE `liquidacoes`;
--> statement-breakpoint
ALTER TABLE `liquidacoes_nova` RENAME TO `liquidacoes`;
--> statement-breakpoint
CREATE UNIQUE INDEX `liquidacoes_card_chave_uq` ON `liquidacoes` (`card_id`, `chave`);
--> statement-breakpoint
CREATE INDEX `liquidacoes_card_ano_idx` ON `liquidacoes` (`card_id`, `ano`, `id_orgao_centi`, `removido_em`);
--> statement-breakpoint
CREATE INDEX `liquidacoes_reparticao_idx` ON `liquidacoes` (`reparticao_id`);
--> statement-breakpoint
CREATE INDEX `liquidacoes_orgao_idx` ON `liquidacoes` (`orgao_id`);
--> statement-breakpoint
UPDATE `empenho_cards` SET `origem_id` = NULL;
--> statement-breakpoint
DROP INDEX `empenho_cards_tipo_idx`;
--> statement-breakpoint
CREATE INDEX `empenho_cards_tipo_idx` ON `empenho_cards` (`tipo`);
