-- A LISTA de tarefas pode ser ATRIBUÍDA a uma pessoa (aditiva): a tarefa nova na lista já nasce com ela como responsável
-- e o "Criar tarefa" da Mesa sugere as listas da pessoa. Excluir a pessoa só tira a atribuição.
ALTER TABLE `tarefa_listas` ADD `responsavel_id` integer REFERENCES `usuarios`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `tarefa_listas_responsavel_idx` ON `tarefa_listas` (`responsavel_id`);
