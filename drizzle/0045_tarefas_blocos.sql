-- 0045 — TAREFAS: BLOCOS. A tarefa passa a ser montada por BLOCOS (nota, checklist, link, prazo, responsáveis, etiquetas,
-- vínculo, estimativa, recorrência) na ordem escolhida — `blocos` = JSON da lista (NULL = tarefa antiga: os blocos saem
-- dos campos preenchidos). Os ANEXOS saem do sistema: os LINKS viram blocos Link (nada se perde) e a tabela
-- `tarefa_anexos` fica DORMENTE (sem código; sem DROP). Aditiva.
ALTER TABLE `tarefas` ADD `blocos` text;
--> statement-breakpoint
UPDATE `tarefas` SET `blocos` = (
	SELECT json_group_array(json_object('id', 'l' || a.`id`, 'tipo', 'link', 'url', a.`url`, 'titulo', a.`nome`))
	FROM `tarefa_anexos` a
	WHERE a.`tarefa_id` = `tarefas`.`id` AND a.`tipo` = 'link' AND a.`url` IS NOT NULL
) WHERE EXISTS (SELECT 1 FROM `tarefa_anexos` a WHERE a.`tarefa_id` = `tarefas`.`id` AND a.`tipo` = 'link' AND a.`url` IS NOT NULL);
