-- LEITURA FRAGMENTADA da atualização AUTOMÁTICA dos cards de empenhos/liquidações/pagamentos (sem navegador): a resposta
-- da Centi de UMA página é CAPTURADA em fragmentos de texto (`centi_brutos`, ~1 MB por execução do cron, conferidos por
-- uma impressão digital dos bytes) e depois PROCESSADA uma JANELA por execução (`centi_leituras` = onde parou, o pedaço de
-- registro que ficou para a próxima janela e as contagens) — cada execução fica bem abaixo do limite de CPU do plano
-- gratuito do Worker, qualquer que seja o tamanho do mês.
CREATE TABLE `centi_leituras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lote_id` integer NOT NULL REFERENCES `centi_lotes`(`id`) ON DELETE cascade,
	`inicio` text NOT NULL,
	`fim` text NOT NULL,
	`pagina` integer NOT NULL,
	`bytes_capturados` integer NOT NULL DEFAULT 0,
	`chars_capturados` integer NOT NULL DEFAULT 0,
	`cauda` text,
	`capturado` integer NOT NULL DEFAULT 0,
	`reinicios` integer NOT NULL DEFAULT 0,
	`comprimento` integer,
	`pos` integer NOT NULL DEFAULT 0,
	`forma` text,
	`resto` text NOT NULL DEFAULT '',
	`parte` integer NOT NULL DEFAULT 0,
	`passo_id` integer,
	`recebidos` integer NOT NULL DEFAULT 0,
	`recusados` integer NOT NULL DEFAULT 0,
	`repetidos` integer NOT NULL DEFAULT 0,
	`total` integer,
	`reparado` integer NOT NULL DEFAULT 0,
	`status` integer,
	`ms` integer,
	`reservado_ate` text,
	`criado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `centi_leituras_lote_idx` ON `centi_leituras` (`lote_id`);
--> statement-breakpoint
CREATE TABLE `centi_brutos` (
	`leitura_id` integer NOT NULL REFERENCES `centi_leituras`(`id`) ON DELETE cascade,
	`ordem` integer NOT NULL,
	`ini` integer NOT NULL,
	`chars` integer NOT NULL,
	`texto` text NOT NULL,
	PRIMARY KEY (`leitura_id`, `ordem`)
);
