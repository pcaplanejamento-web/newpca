CREATE TABLE `protocolos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` text NOT NULL,
	`assunto` text NOT NULL,
	`secretaria` text,
	`responsavel_id` integer,
	`status` text DEFAULT 'recebido' NOT NULL,
	`prioridade` text DEFAULT 'media' NOT NULL,
	`data_entrada` text,
	`prazo` text,
	`data_conclusao` text,
	`observacoes` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `protocolos_status_idx` ON `protocolos` (`status`);
--> statement-breakpoint
CREATE INDEX `protocolos_resp_idx` ON `protocolos` (`responsavel_id`);
--> statement-breakpoint
CREATE INDEX `protocolos_prazo_idx` ON `protocolos` (`prazo`);
