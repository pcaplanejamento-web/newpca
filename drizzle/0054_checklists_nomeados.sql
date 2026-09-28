-- 0054 — CHECKLISTS NOMEADOS (aditiva). Uma tarefa passa a ter VÁRIOS checklists com nome ("SERVIDORES COM FALTA",
-- "CADASTRO DE BIOMETRIA"…); cada item ganha PRAZO e RESPONSÁVEL próprios. Os itens que já existiam entram num checklist
-- "Checklist" da própria tarefa — nada se perde.
CREATE TABLE `tarefa_checklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tarefa_id` integer NOT NULL,
	`nome` text DEFAULT 'Checklist' NOT NULL,
	`ordem` real DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_checklists_tarefa_idx` ON `tarefa_checklists` (`tarefa_id`, `ordem`);
--> statement-breakpoint
ALTER TABLE `tarefa_checklist` ADD `checklist_id` integer REFERENCES `tarefa_checklists`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `tarefa_checklist` ADD `prazo` text;
--> statement-breakpoint
ALTER TABLE `tarefa_checklist` ADD `responsavel_id` integer REFERENCES `usuarios`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `tarefa_checklist_lista_idx` ON `tarefa_checklist` (`checklist_id`, `ordem`);
--> statement-breakpoint
CREATE INDEX `tarefa_checklist_resp_idx` ON `tarefa_checklist` (`responsavel_id`);
--> statement-breakpoint
INSERT INTO `tarefa_checklists` (`tarefa_id`, `nome`, `ordem`)
SELECT DISTINCT `tarefa_id`, 'Checklist', 1 FROM `tarefa_checklist`;
--> statement-breakpoint
UPDATE `tarefa_checklist` SET `checklist_id` = (SELECT c.`id` FROM `tarefa_checklists` c WHERE c.`tarefa_id` = `tarefa_checklist`.`tarefa_id`)
WHERE `checklist_id` IS NULL;
