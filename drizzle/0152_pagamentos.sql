-- PAGAMENTOS da Centi (ordens de pagamento — API `GetOrdempaPamento`): um MÓDULO próprio (tela Pagamentos, com permissão
-- própria), com cards na MESMA tabela dos cards (`empenho_cards.tipo` = 'pagamentos'), no padrão das LIQUIDAÇÕES: uma
-- importação lê todos os órgãos com o "ID na Centi", MÊS a MÊS; o NÚMERO DO EMPENHO dá o órgão e a unidade de cada pagamento.
CREATE TABLE `pagamentos_staging` (
	`lote_id` integer NOT NULL REFERENCES `centi_lotes`(`id`) ON DELETE cascade,
	`pagina` integer NOT NULL,
	`chave` text NOT NULL,
	`ano` integer NOT NULL,
	`src_id` integer,
	`data` text,
	`numero_empenho` text NOT NULL,
	`orgao` text NOT NULL DEFAULT '',
	`credor` text,
	`cpf_cnpj` text,
	`historico` text,
	`valor` real NOT NULL DEFAULT 0,
	`valor_retencao` real NOT NULL DEFAULT 0,
	`valor_liquido` real NOT NULL DEFAULT 0,
	`anulado` integer NOT NULL DEFAULT 0,
	`motivo_anulacao` text,
	`id_orgao_centi` integer,
	PRIMARY KEY (`lote_id`, `chave`)
);
--> statement-breakpoint
CREATE TABLE `pagamentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chave` text NOT NULL,
	`ano` integer NOT NULL,
	`src_id` integer,
	`data` text,
	`numero_empenho` text NOT NULL,
	`orgao` text NOT NULL DEFAULT '',
	`credor` text,
	`cpf_cnpj` text,
	`historico` text,
	`valor` real NOT NULL DEFAULT 0,
	`valor_retencao` real NOT NULL DEFAULT 0,
	`valor_liquido` real NOT NULL DEFAULT 0,
	`anulado` integer NOT NULL DEFAULT 0,
	`motivo_anulacao` text,
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
CREATE UNIQUE INDEX `pagamentos_card_chave_uq` ON `pagamentos` (`card_id`, `chave`);
--> statement-breakpoint
CREATE INDEX `pagamentos_card_ano_idx` ON `pagamentos` (`card_id`, `ano`, `id_orgao_centi`, `removido_em`);
--> statement-breakpoint
CREATE INDEX `pagamentos_reparticao_idx` ON `pagamentos` (`reparticao_id`);
--> statement-breakpoint
CREATE INDEX `pagamentos_orgao_idx` ON `pagamentos` (`orgao_id`);
--> statement-breakpoint
CREATE INDEX `pagamentos_lote_idx` ON `pagamentos` (`lote_id`);
--> statement-breakpoint
CREATE INDEX `pagamentos_numero_empenho_idx` ON `pagamentos` (`numero_empenho`);
--> statement-breakpoint
-- A TELA nova: os papéis ganham nela o que têm em Liquidações.
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.pagamentos', json_extract(`capacidades`, '$.liquidacoes'))
WHERE json_valid(`capacidades`) AND json_type(`capacidades`, '$.liquidacoes') = 'array' AND json_extract(`capacidades`, '$.pagamentos') IS NULL;
--> statement-breakpoint
-- … os grupos que abrem Liquidações (pelas telas avulsas) também abrem Pagamentos.
UPDATE `grupos` SET `abas` = json_insert(`abas`, '$[#]', 'pagamentos')
WHERE json_valid(`abas`) AND EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'liquidacoes')
  AND NOT EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'pagamentos');
--> statement-breakpoint
-- … e os MÓDULOS do ADM que têm Liquidações ganham Pagamentos logo ao lado.
UPDATE `configuracoes` SET `dados` = json_set(`dados`, '$.modulos', (
  SELECT json_group_array(json(CASE
    WHEN EXISTS (SELECT 1 FROM json_each(m.value, '$.telas') WHERE value = 'liquidacoes') AND NOT EXISTS (SELECT 1 FROM json_each(m.value, '$.telas') WHERE value = 'pagamentos')
    THEN json_set(m.value, '$.telas', json_insert(json_extract(m.value, '$.telas'), '$[#]', 'pagamentos'))
    ELSE m.value END))
  FROM json_each(`configuracoes`.`dados`, '$.modulos') m))
WHERE json_valid(`dados`) AND json_type(`dados`, '$.modulos') = 'array';
