-- PASTAS de quadros no banco: a PÚBLICA é do grupo (todos os membros veem; editores organizam) e a PRIVADA é do dono (só ele
-- vê; os quadros dela ficam privados). Um quadro fica em no máximo UMA pasta (`tarefa_quadros.pasta_id`, set null) e
-- `pasta_ordem` guarda o lugar dele dentro dela. A ORDEM da raiz (pastas e quadros soltos) segue pessoal, na preferência
-- `tarefas:conjuntos` (agora só `{ordem}`).
-- Conversão: cada pasta antiga (a preferência de cada pessoa) vira uma pasta PÚBLICA do grupo do 1º quadro não privado
-- dela; cada quadro vai para a 1ª pasta do MESMO grupo que o continha (os de outro grupo e os privados ficam soltos).
-- `legado` só liga a conversão (dormente depois).
CREATE TABLE `tarefa_pastas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grupo_id` integer NOT NULL,
	`nome` text NOT NULL,
	`cor` text DEFAULT '#579dff' NOT NULL,
	`privado` integer DEFAULT 0 NOT NULL,
	`criado_por` integer,
	`ordem` real DEFAULT 0 NOT NULL,
	`legado` text,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`grupo_id`) REFERENCES `grupos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tarefa_pastas_grupo_idx` ON `tarefa_pastas` (`grupo_id`);
--> statement-breakpoint
ALTER TABLE `tarefa_quadros` ADD `pasta_id` integer REFERENCES `tarefa_pastas`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `tarefa_quadros` ADD `pasta_ordem` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `tarefa_quadros_pasta_idx` ON `tarefa_quadros` (`pasta_id`);
--> statement-breakpoint
INSERT INTO `tarefa_pastas` (`grupo_id`, `nome`, `cor`, `privado`, `criado_por`, `ordem`, `legado`)
SELECT `g`, `nome`, `cor`, 0, `usuario_id`, `ordem`, `legado` FROM (
	SELECT
		(SELECT q.`grupo_id` FROM json_each(c.value, '$.quadros') j JOIN `tarefa_quadros` q ON q.`id` = j.value AND q.`privado` = 0 ORDER BY CAST(j.key AS integer) LIMIT 1) AS `g`,
		substr(COALESCE(NULLIF(trim(json_extract(c.value, '$.nome')), ''), 'Pasta'), 1, 40) AS `nome`,
		CASE WHEN length(json_extract(c.value, '$.cor')) = 7 AND lower(json_extract(c.value, '$.cor')) GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' THEN lower(json_extract(c.value, '$.cor')) ELSE '#579dff' END AS `cor`,
		p.`usuario_id` AS `usuario_id`,
		CAST(c.key AS real) AS `ordem`,
		p.`usuario_id` || ':' || json_extract(c.value, '$.id') AS `legado`
	FROM `preferencias_tabela` p, json_each(CASE WHEN json_valid(p.`valor`) THEN p.`valor` ELSE '{}' END, '$.lista') c
	WHERE p.`chave` = 'tarefas:conjuntos'
) WHERE `g` IS NOT NULL;
--> statement-breakpoint
UPDATE `tarefa_quadros` SET `pasta_id` = (
	SELECT tp.`id` FROM `preferencias_tabela` p,
		json_each(CASE WHEN json_valid(p.`valor`) THEN p.`valor` ELSE '{}' END, '$.lista') c,
		json_each(c.value, '$.quadros') j,
		`tarefa_pastas` tp
	WHERE p.`chave` = 'tarefas:conjuntos' AND j.value = `tarefa_quadros`.`id`
		AND tp.`legado` = p.`usuario_id` || ':' || json_extract(c.value, '$.id') AND tp.`grupo_id` = `tarefa_quadros`.`grupo_id`
	ORDER BY tp.`id` LIMIT 1
) WHERE `privado` = 0;
--> statement-breakpoint
UPDATE `tarefa_quadros` SET `pasta_ordem` = COALESCE((
	SELECT CAST(j.key AS real) + 1 FROM `preferencias_tabela` p,
		json_each(CASE WHEN json_valid(p.`valor`) THEN p.`valor` ELSE '{}' END, '$.lista') c,
		json_each(c.value, '$.quadros') j,
		`tarefa_pastas` tp
	WHERE p.`chave` = 'tarefas:conjuntos' AND j.value = `tarefa_quadros`.`id` AND tp.`id` = `tarefa_quadros`.`pasta_id`
		AND tp.`legado` = p.`usuario_id` || ':' || json_extract(c.value, '$.id')
	LIMIT 1
), 0) WHERE `pasta_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `preferencias_tabela` SET `valor` = json_remove(`valor`, '$.lista') WHERE `chave` = 'tarefas:conjuntos' AND json_valid(`valor`);
