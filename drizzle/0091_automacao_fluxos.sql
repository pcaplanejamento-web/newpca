-- FLUXOS DE AUTOMAÇÃO (estilo N8N): nós ligados (grafo JSON), frequência e o resumo da última execução. Aditiva.
CREATE TABLE `automacao_fluxos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`grafo` text DEFAULT '{"nos":[],"conexoes":[]}' NOT NULL,
	`frequencia` text DEFAULT '{"tipo":"manual"}' NOT NULL,
	`ativo` integer DEFAULT false NOT NULL,
	`proxima_em` text,
	`ultima_em` text,
	`ultima_execucao` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `automacao_fluxos_proxima_idx` ON `automacao_fluxos` (`proxima_em`);
