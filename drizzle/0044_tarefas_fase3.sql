-- 0044 — TAREFAS, fase 3: RECORRÊNCIA (a regra no cartão + o elo com a ocorrência anterior — ÚNICO: concluir de novo
-- nunca gera a próxima duas vezes), NOTIFICAÇÕES (o sino; as de prazo são derivadas na LEITURA e gravadas com uma
-- CHAVE única por pessoa — sem cron), MODELOS de quadro e de tarefa e AUTOMAÇÕES simples por quadro. Aditiva: colunas
-- nulas e tabelas novas e vazias.
ALTER TABLE `tarefas` ADD `recorrencia` text;
--> statement-breakpoint
ALTER TABLE `tarefas` ADD `recorrencia_anterior_id` integer REFERENCES `tarefas`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE UNIQUE INDEX `tarefas_recorrencia_anterior_uq` ON `tarefas` (`recorrencia_anterior_id`);
--> statement-breakpoint
CREATE TABLE `notificacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`texto` text,
	`link` text,
	`tarefa_id` integer,
	`quadro_id` integer,
	`ator_id` integer,
	`ator_nome` text,
	`chave` text,
	`lida` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ator_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notificacoes_usuario_idx` ON `notificacoes` (`usuario_id`, `lida`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `notificacoes_chave_uq` ON `notificacoes` (`usuario_id`, `chave`);
--> statement-breakpoint
CREATE TABLE `tarefa_modelos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`grupo_id` integer,
	`quadro_id` integer,
	`nome` text NOT NULL,
	`conteudo` text DEFAULT '{}' NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tarefa_modelos_grupo_idx` ON `tarefa_modelos` (`tipo`, `grupo_id`);
--> statement-breakpoint
CREATE INDEX `tarefa_modelos_quadro_idx` ON `tarefa_modelos` (`quadro_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_automacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`gatilho` text NOT NULL,
	`lista_id` integer,
	`acao` text NOT NULL,
	`ativa` integer DEFAULT 1 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lista_id`) REFERENCES `tarefa_listas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_automacoes_quadro_idx` ON `tarefa_automacoes` (`quadro_id`);
