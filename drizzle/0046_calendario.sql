-- 0046 — CALENDÁRIO como MÓDULO próprio + EVENTOS das tarefas. A aba de permissão `calendario` vai a toda permissão
-- que já tem as Tarefas (ninguém perde o acesso que tinha pelo menu). A tabela `tarefa_eventos` guarda os EVENTOS que
-- cada tarefa cria (o bloco "Eventos"): data, dia inteiro ou horário, local, descrição e cor. Aditiva: tabela nova e vazia.
CREATE TABLE `tarefa_eventos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarefa_id` integer NOT NULL,
	`titulo` text NOT NULL,
	`data` text NOT NULL,
	`dia_inteiro` integer DEFAULT 1 NOT NULL,
	`hora_inicio` text,
	`hora_fim` text,
	`local` text,
	`descricao` text,
	`cor` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tarefa_eventos_tarefa_idx` ON `tarefa_eventos` (`tarefa_id`);
--> statement-breakpoint
CREATE INDEX `tarefa_eventos_data_idx` ON `tarefa_eventos` (`data`);
--> statement-breakpoint
UPDATE `permissoes` SET `abas` = json_insert(`abas`, '$[#]', 'calendario')
WHERE `abas` LIKE '%"tarefas"%' AND `abas` NOT LIKE '%"calendario"%';
