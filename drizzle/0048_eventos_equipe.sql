-- 0048 — EVENTOS de EQUIPE no Calendário. Aditiva: o evento ganha a REPETIÇÃO própria (JSON `RecorrenciaEvento`; NULL = não
-- se repete), o LINK da reunião (Meet/Teams/Zoom colado), LIVRE/OCUPADO (`ocupado`, padrão 1) e PRIVADO (`privado`, padrão 0
-- — quem não participa vê só "Ocupado"); `tarefa_evento_convidados` guarda os CONVIDADOS (pessoas do grupo do quadro) e a
-- RESPOSTA de cada um (pendente/sim/nao/talvez).
ALTER TABLE `tarefa_eventos` ADD `recorrencia` text;
--> statement-breakpoint
ALTER TABLE `tarefa_eventos` ADD `link_reuniao` text;
--> statement-breakpoint
ALTER TABLE `tarefa_eventos` ADD `ocupado` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `tarefa_eventos` ADD `privado` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `tarefa_evento_convidados` (
	`evento_id` integer NOT NULL,
	`usuario_id` integer NOT NULL,
	`resposta` text DEFAULT 'pendente' NOT NULL,
	`respondido_em` text,
	PRIMARY KEY(`evento_id`, `usuario_id`),
	FOREIGN KEY (`evento_id`) REFERENCES `tarefa_eventos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_evento_convidados_usuario_idx` ON `tarefa_evento_convidados` (`usuario_id`);
