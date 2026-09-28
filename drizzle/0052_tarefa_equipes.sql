-- 0052 — EQUIPES do quadro de tarefas. Aditiva: a equipe é um grupo de PESSOAS do quadro (nome + cor + ordem); a tarefa
-- recebe equipes além das pessoas e os MEMBROS delas passam a ser envolvidos na tarefa (filtro, carga, calendário, lembretes
-- e eventos privados). Mudar a equipe muda todas as tarefas dela (o vínculo é por referência).
CREATE TABLE `tarefa_equipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`nome` text NOT NULL,
	`cor` text NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_equipes_quadro_idx` ON `tarefa_equipes` (`quadro_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_equipe_membros` (
	`equipe_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	PRIMARY KEY(`equipe_id`, `usuario_id`),
	FOREIGN KEY (`equipe_id`) REFERENCES `tarefa_equipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_equipe_membros_usuario_idx` ON `tarefa_equipe_membros` (`usuario_id`);
--> statement-breakpoint
CREATE TABLE `tarefa_equipes_links` (
	`tarefa_id` integer NOT NULL,
	`equipe_id` integer NOT NULL,
	PRIMARY KEY(`tarefa_id`, `equipe_id`),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipe_id`) REFERENCES `tarefa_equipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_equipes_links_equipe_idx` ON `tarefa_equipes_links` (`equipe_id`);
--> statement-breakpoint
-- Ajuste de DADOS: no Calendário Institucional PCA 2026/2027, a "Etapa 8" (ticket 8) e os "Avisos / Notificações"
-- (ticket 9) ficam só com o PRAZO — o período longo desenhava uma barra em todas as semanas. Sem o quadro, não faz nada.
UPDATE `tarefas` SET `inicio` = NULL
WHERE `ticket` IN (8, 9) AND `quadro_id` IN (
	SELECT q.`id` FROM `tarefa_quadros` q JOIN `grupos` g ON g.`id` = q.`grupo_id`
	WHERE q.`nome` = 'Calendário Institucional PCA 2026/2027' AND lower(trim(g.`nome`)) = 'planejamento e custos'
);
