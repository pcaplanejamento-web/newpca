-- 0057 — VÍNCULOS MÚLTIPLOS da tarefa (aditiva). `tarefa_vinculos` (tarefa cascade + tipo protocolo|dfd|pca|orcamento|tarefa
-- + alvo, único por tarefa + tipo + alvo; sem FK no alvo — ele pode ser excluído depois). O vínculo entre TAREFAS é dos dois
-- lados (a leitura olha também `tipo = 'tarefa' AND alvo_id = <a tarefa>`). O vínculo ÚNICO antigo (`tarefas.vinculo_tipo`/
-- `vinculo_id`) é copiado para cá; as duas colunas ficam DORMENTES (fora do schema, sem DROP).
CREATE TABLE `tarefa_vinculos` (
	`tarefa_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`alvo_id` integer NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	PRIMARY KEY(`tarefa_id`, `tipo`, `alvo_id`),
	FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tarefa_vinculos_alvo_idx` ON `tarefa_vinculos` (`tipo`, `alvo_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `tarefa_vinculos` (`tarefa_id`, `tipo`, `alvo_id`)
SELECT `id`, `vinculo_tipo`, `vinculo_id` FROM `tarefas`
WHERE `vinculo_tipo` IN ('protocolo', 'dfd', 'pca', 'orcamento') AND `vinculo_id` IS NOT NULL;
