-- 0042 — TAREFAS (quadro estilo Trello): QUADROS por grupo (vários), LISTAS (colunas) e CARTÕES (tarefas/tickets) com
-- nº de TICKET sequencial por quadro, responsáveis (pessoas do grupo), prazo, prioridade e ETIQUETAS do quadro. Aditiva:
-- tabelas novas e vazias. A aba "tarefas" é concedida a quem já tem a Mesa ("dfd").
CREATE TABLE `tarefa_quadros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grupo_id` integer NOT NULL,
	`nome` text NOT NULL,
	`cor` text DEFAULT '#6366f1' NOT NULL,
	`descricao` text,
	`arquivado` integer DEFAULT 0 NOT NULL,
	`prox_ticket` integer DEFAULT 1 NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tarefa_quadros_grupo_idx` ON `tarefa_quadros` (`grupo_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_listas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`nome` text NOT NULL,
	`ordem` real DEFAULT 0 NOT NULL,
	`limite_wip` integer,
	`concluida` integer DEFAULT 0 NOT NULL,
	`arquivada` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_listas_quadro_idx` ON `tarefa_listas` (`quadro_id`, `ordem`);
--> statement-breakpoint
CREATE TABLE `tarefas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`lista_id` integer NOT NULL,
	`ticket` integer NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text,
	`prioridade` text DEFAULT 'media' NOT NULL,
	`inicio` text,
	`prazo` text,
	`ordem` real DEFAULT 0 NOT NULL,
	`concluida_em` text,
	`arquivada` integer DEFAULT 0 NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lista_id`) REFERENCES `tarefa_listas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tarefas_quadro_ticket_uq` ON `tarefas` (`quadro_id`, `ticket`);
--> statement-breakpoint
CREATE INDEX `tarefas_lista_ordem_idx` ON `tarefas` (`lista_id`, `ordem`);
--> statement-breakpoint
CREATE INDEX `tarefas_prazo_idx` ON `tarefas` (`prazo`);
--> statement-breakpoint
CREATE TABLE `tarefa_pessoas` (
	`tarefa_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`papel` text DEFAULT 'responsavel' NOT NULL,
	PRIMARY KEY(`tarefa_id`, `usuario_id`),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_pessoas_usuario_idx` ON `tarefa_pessoas` (`usuario_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_etiquetas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`nome` text NOT NULL,
	`cor` text NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_etiquetas_quadro_idx` ON `tarefa_etiquetas` (`quadro_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_etiqueta_links` (
	`tarefa_id` integer NOT NULL,
	`etiqueta_id` integer NOT NULL,
	PRIMARY KEY(`tarefa_id`, `etiqueta_id`),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`etiqueta_id`) REFERENCES `tarefa_etiquetas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
UPDATE `permissoes` SET `abas` = json_insert(`abas`, '$[#]', 'tarefas')
WHERE `abas` LIKE '%"dfd"%' AND `abas` NOT LIKE '%"tarefas"%';
