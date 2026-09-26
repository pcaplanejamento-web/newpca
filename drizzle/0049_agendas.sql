-- 0049 — AGENDAS EXTERNAS e PÁGINAS DE AGENDAMENTO do Calendário. Aditiva (tabelas novas e vazias):
-- `calendario_externos` = as agendas .ics de outros sistemas que a PESSOA assina (somente leitura; lidas sob demanda);
-- `agenda_paginas` = o link público (`/agendar/<slug>`) onde qualquer um marca um horário livre da pessoa — o agendamento
-- vira um EVENTO na tarefa escolhida (`tarefa_id`; excluir a tarefa exclui a página).
CREATE TABLE `calendario_externos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`nome` text NOT NULL,
	`url` text NOT NULL,
	`cor` text,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calendario_externos_usuario_idx` ON `calendario_externos` (`usuario_id`);
--> statement-breakpoint
CREATE TABLE `agenda_paginas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer NOT NULL,
	`tarefa_id` integer NOT NULL,
	`slug` text NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text,
	`duracao_min` integer DEFAULT 30 NOT NULL,
	`dias` text DEFAULT '[1,2,3,4,5]' NOT NULL,
	`hora_inicio` text DEFAULT '08:00' NOT NULL,
	`hora_fim` text DEFAULT '17:00' NOT NULL,
	`antecedencia_h` integer DEFAULT 2 NOT NULL,
	`janela_dias` integer DEFAULT 30 NOT NULL,
	`ativa` integer DEFAULT 1 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_paginas_slug_uq` ON `agenda_paginas` (`slug`);
--> statement-breakpoint
CREATE INDEX `agenda_paginas_usuario_idx` ON `agenda_paginas` (`usuario_id`);
