-- RETOMADA dos subfluxos: os itens já concluídos por um nó "Executar fluxo" (por fluxo de topo + caminho do nó). Aditiva.
CREATE TABLE `automacao_progresso` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fluxo_id` integer NOT NULL,
	`no` text NOT NULL,
	`chave` text NOT NULL,
	`estado` text NOT NULL,
	`em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`fluxo_id`) REFERENCES `automacao_fluxos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automacao_progresso_uq` ON `automacao_progresso` (`fluxo_id`,`no`,`chave`);
