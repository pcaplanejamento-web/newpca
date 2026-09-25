-- 0043 — TAREFAS, fase 2: o CONTEÚDO do cartão (checklist, comentários com @menção, anexos — links e arquivos pequenos),
-- a ESTIMATIVA (horas) e o VÍNCULO com o resto do sistema (protocolo, DFD, PCA ou orçamento). Aditiva: duas colunas
-- novas (nulas) e tabelas novas e vazias. Observadores usam `tarefa_pessoas.papel = 'observador'` (sem mudança).
ALTER TABLE `tarefas` ADD `estimativa_h` real;
--> statement-breakpoint
ALTER TABLE `tarefas` ADD `vinculo_tipo` text;
--> statement-breakpoint
ALTER TABLE `tarefas` ADD `vinculo_id` integer;
--> statement-breakpoint
CREATE INDEX `tarefas_vinculo_idx` ON `tarefas` (`vinculo_tipo`, `vinculo_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_checklist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarefa_id` integer NOT NULL,
	`texto` text NOT NULL,
	`feito` integer DEFAULT 0 NOT NULL,
	`ordem` real DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_checklist_tarefa_idx` ON `tarefa_checklist` (`tarefa_id`, `ordem`);
--> statement-breakpoint
CREATE TABLE `tarefa_comentarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarefa_id` integer NOT NULL,
	`usuario_id` integer,
	`usuario_nome` text NOT NULL,
	`texto` text NOT NULL,
	`mencoes` text DEFAULT '[]' NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`editado_em` text,
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tarefa_comentarios_tarefa_idx` ON `tarefa_comentarios` (`tarefa_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_anexos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarefa_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`nome` text NOT NULL,
	`url` text,
	`conteudo` text,
	`mime` text,
	`tamanho` integer,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tarefa_anexos_tarefa_idx` ON `tarefa_anexos` (`tarefa_id`);
