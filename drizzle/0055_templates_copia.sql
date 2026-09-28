-- 0055 — TEMPLATES de cartão + CÓPIA (aditiva). `tarefas.template` (1 = o cartão é um template: fica fora de contagens,
-- filtros de prazo, Dashboard, Calendário, avisos e busca; criar a partir dele = COPIAR) e `copiada_de` (a origem da cópia).
-- Os MODELOS DE TAREFA antigos viram cartões-template numa lista "TEMPLATES" (a 1ª) do quadro deles: título, descrição,
-- prioridade, estimativa, recorrência, blocos, etiquetas (as que ainda existem) e o checklist; o cadastro antigo sai.
ALTER TABLE `tarefas` ADD `template` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `tarefas` ADD `copiada_de` integer REFERENCES `tarefas`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `tarefas_template_idx` ON `tarefas` (`quadro_id`, `template`);
--> statement-breakpoint
CREATE TABLE `_modelos_para_template` (
	`modelo_id` integer PRIMARY KEY NOT NULL,
	`quadro_id` integer NOT NULL,
	`ticket` integer NOT NULL,
	`ordem` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `_modelos_para_template` (`modelo_id`, `quadro_id`, `ticket`, `ordem`)
SELECT m.`id`, m.`quadro_id`,
	q.`prox_ticket` - 1 + ROW_NUMBER() OVER (PARTITION BY m.`quadro_id` ORDER BY m.`id`),
	ROW_NUMBER() OVER (PARTITION BY m.`quadro_id` ORDER BY m.`id`)
FROM `tarefa_modelos` m JOIN `tarefa_quadros` q ON q.`id` = m.`quadro_id`
WHERE m.`tipo` = 'tarefa' AND json_valid(m.`conteudo`);
--> statement-breakpoint
INSERT INTO `tarefa_listas` (`quadro_id`, `nome`, `ordem`)
SELECT DISTINCT x.`quadro_id`, 'TEMPLATES', (SELECT COALESCE(MIN(l.`ordem`), 1) - 1 FROM `tarefa_listas` l WHERE l.`quadro_id` = x.`quadro_id`)
FROM `_modelos_para_template` x;
--> statement-breakpoint
INSERT INTO `tarefas` (`quadro_id`, `lista_id`, `ticket`, `titulo`, `descricao`, `prioridade`, `ordem`, `estimativa_h`, `recorrencia`, `blocos`, `template`, `criado_por`)
SELECT x.`quadro_id`,
	(SELECT MAX(l.`id`) FROM `tarefa_listas` l WHERE l.`quadro_id` = x.`quadro_id` AND l.`nome` = 'TEMPLATES'),
	x.`ticket`,
	-- O título como está (o "2. Protocolo - FALTA - " termina em " - " de propósito — completa-se ao usar); vazio = o nome do modelo.
	substr(CASE WHEN trim(COALESCE(json_extract(m.`conteudo`, '$.titulo'), '')) <> '' THEN json_extract(m.`conteudo`, '$.titulo') ELSE m.`nome` END, 1, 200),
	json_extract(m.`conteudo`, '$.descricao'),
	CASE WHEN json_extract(m.`conteudo`, '$.prioridade') IN ('baixa', 'media', 'alta', 'urgente') THEN json_extract(m.`conteudo`, '$.prioridade') ELSE 'media' END,
	x.`ordem`,
	json_extract(m.`conteudo`, '$.estimativaH'),
	CASE WHEN json_type(m.`conteudo`, '$.recorrencia') = 'object' THEN json_extract(m.`conteudo`, '$.recorrencia') END,
	CASE WHEN json_type(m.`conteudo`, '$.blocos') = 'array' THEN json_extract(m.`conteudo`, '$.blocos') END,
	1,
	m.`criado_por`
FROM `_modelos_para_template` x JOIN `tarefa_modelos` m ON m.`id` = x.`modelo_id`;
--> statement-breakpoint
UPDATE `tarefa_quadros` SET `prox_ticket` = `prox_ticket` + (SELECT COUNT(*) FROM `_modelos_para_template` x WHERE x.`quadro_id` = `tarefa_quadros`.`id`)
WHERE `id` IN (SELECT `quadro_id` FROM `_modelos_para_template`);
--> statement-breakpoint
INSERT OR IGNORE INTO `tarefa_etiqueta_links` (`tarefa_id`, `etiqueta_id`)
SELECT t.`id`, CAST(j.`value` AS integer)
FROM `_modelos_para_template` x
JOIN `tarefa_modelos` m ON m.`id` = x.`modelo_id`
JOIN `tarefas` t ON t.`quadro_id` = x.`quadro_id` AND t.`ticket` = x.`ticket`
JOIN json_each(m.`conteudo`, '$.etiquetas') j
WHERE EXISTS (SELECT 1 FROM `tarefa_etiquetas` e WHERE e.`id` = CAST(j.`value` AS integer) AND e.`quadro_id` = x.`quadro_id`);
--> statement-breakpoint
INSERT INTO `tarefa_checklists` (`tarefa_id`, `nome`, `ordem`)
SELECT t.`id`, 'Checklist', 1
FROM `_modelos_para_template` x
JOIN `tarefa_modelos` m ON m.`id` = x.`modelo_id`
JOIN `tarefas` t ON t.`quadro_id` = x.`quadro_id` AND t.`ticket` = x.`ticket`
WHERE COALESCE(json_array_length(m.`conteudo`, '$.checklist'), 0) > 0;
--> statement-breakpoint
INSERT INTO `tarefa_checklist` (`tarefa_id`, `checklist_id`, `texto`, `ordem`)
SELECT t.`id`, c.`id`, substr(trim(j.`value`), 1, 300), j.`key` + 1
FROM `_modelos_para_template` x
JOIN `tarefa_modelos` m ON m.`id` = x.`modelo_id`
JOIN `tarefas` t ON t.`quadro_id` = x.`quadro_id` AND t.`ticket` = x.`ticket`
JOIN `tarefa_checklists` c ON c.`tarefa_id` = t.`id`
JOIN json_each(m.`conteudo`, '$.checklist') j
WHERE j.`type` = 'text' AND trim(j.`value`) <> '';
--> statement-breakpoint
DROP TABLE `_modelos_para_template`;
--> statement-breakpoint
DELETE FROM `tarefa_modelos` WHERE `tipo` = 'tarefa';
