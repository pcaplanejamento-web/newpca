-- 0040 — PREFERÊNCIAS DE TABELA por usuário: os ajustes salvos de uma tabela (larguras, colunas fixadas/ocultas,
-- ordem) — hoje o Comparativo do orçamento, uma chave por par de colunas ligadas. Aditiva (tabela nova e vazia).
CREATE TABLE `preferencias_tabela` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`chave` text NOT NULL,
	`valor` text NOT NULL,
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferencias_tabela_uq` ON `preferencias_tabela` (`usuario_id`,`chave`);
