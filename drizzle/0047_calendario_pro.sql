-- 0047 — CALENDÁRIO profissional. Aditiva: o EVENTO ganha a DATA FINAL (evento de vários dias; NULL = um dia só) e o
-- LEMBRETE (minutos antes do início; NULL = sem lembrete — vira notificação no sino, derivada na leitura); a tabela
-- `feriados` guarda os feriados e pontos facultativos cadastrados pelo ADM (os nacionais são calculados no código); e
-- `calendario_tokens` guarda o HASH do link de ASSINATURA (.ics) de cada pessoa (o link só aparece ao ser gerado).
ALTER TABLE `tarefa_eventos` ADD `data_fim` text;
--> statement-breakpoint
ALTER TABLE `tarefa_eventos` ADD `lembrete_min` integer;
--> statement-breakpoint
CREATE TABLE `feriados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data` text NOT NULL,
	`nome` text NOT NULL,
	`tipo` text DEFAULT 'municipal' NOT NULL,
	`anual` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `feriados_data_idx` ON `feriados` (`data`);
--> statement-breakpoint
CREATE TABLE `calendario_tokens` (
	`usuario_id` integer PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendario_tokens_hash_uq` ON `calendario_tokens` (`token_hash`);
