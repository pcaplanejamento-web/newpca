-- 0041 — EDIÇÕES SALVAS de tabela (hoje o Comparativo do orçamento): cada usuário salva quantas quiser, com nome, só para
-- ele ou PÚBLICAS (todos veem e usam). `chave` = a tabela/contexto (o par de colunas ligadas). A edição que o usuário
-- escolhe como PADRÃO fica em `preferencias_tabela` (chave `padrao:<chave>` → {"id": N}). Os ajustes salvos antes (um
-- por usuário e par, em `preferencias_tabela`) viram a edição pessoal "Minha edição" — e o padrão dele.
CREATE TABLE `edicoes_tabela` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chave` text NOT NULL,
	`nome` text NOT NULL,
	`valor` text NOT NULL,
	`usuario_id` integer NOT NULL,
	`publico` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `edicoes_tabela_chave_idx` ON `edicoes_tabela` (`chave`);
--> statement-breakpoint
INSERT INTO `edicoes_tabela` (`chave`, `nome`, `valor`, `usuario_id`, `publico`)
SELECT `chave`, 'Minha edição', `valor`, `usuario_id`, 0 FROM `preferencias_tabela` WHERE `chave` LIKE 'orcamento-comparativo:%';
--> statement-breakpoint
INSERT INTO `preferencias_tabela` (`usuario_id`, `chave`, `valor`)
SELECT `usuario_id`, 'padrao:' || `chave`, json_object('id', `id`) FROM `edicoes_tabela`;
--> statement-breakpoint
DELETE FROM `preferencias_tabela` WHERE `chave` LIKE 'orcamento-comparativo:%';
