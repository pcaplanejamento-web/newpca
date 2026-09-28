-- 0056 — CAMPOS PERSONALIZADOS do quadro + TÍTULO AUTOMÁTICO (aditiva). `tarefa_campos` (os campos do quadro: nome,
-- tipo texto|numero|data|lista|checkbox, as opções da lista, a ordem e se aparece no cartão), `tarefa_campo_valores` (o
-- valor de cada campo em cada tarefa — um por par) e `tarefa_quadros.formato_titulo` (ex.: "{Categoria} - {Tipo}"; NULL =
-- sem título automático) + `tarefas.titulo_manual` (1 = a pessoa editou o título — o automático não o sobrescreve).
CREATE TABLE `tarefa_campos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`nome` text NOT NULL,
	`tipo` text DEFAULT 'texto' NOT NULL,
	`opcoes` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	`no_cartao` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_campos_quadro_idx` ON `tarefa_campos` (`quadro_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_campo_valores` (
	`tarefa_id` integer NOT NULL,
	`campo_id` integer NOT NULL,
	`valor` text NOT NULL,
	PRIMARY KEY(`tarefa_id`, `campo_id`),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campo_id`) REFERENCES `tarefa_campos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_campo_valores_campo_idx` ON `tarefa_campo_valores` (`campo_id`);
--> statement-breakpoint
ALTER TABLE `tarefa_quadros` ADD `formato_titulo` text;
--> statement-breakpoint
ALTER TABLE `tarefas` ADD `titulo_manual` integer DEFAULT 0 NOT NULL;
