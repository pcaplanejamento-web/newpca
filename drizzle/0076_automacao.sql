-- AUTOMAÇÃO CENTI — FUNDAÇÃO (aditiva; nada muda até a primeira execução):
--  * `automacao_execucoes`: cada execução de uma RECEITA (emitir DFDs, anexar ao protocolo…) — quem, receita + versão,
--    ensaio ou não, estado e os totais; o histórico da tela Automação.
--  * `automacao_passos`: os passos de uma execução (um por alvo), com o resultado — retomar do ponto onde parou.
--  * `automacao_autorizacoes`: a permissão de USO ÚNICO que o servidor dá para UMA escrita na Centi (só o HASH do token;
--    consumida por DELETE … RETURNING — vale uma vez, mesmo com dois pedidos simultâneos).
--  * `automacao_registros`: o que foi ESCRITO na Centi (ex.: o documento anexado a um protocolo) — o mesmo alvo +
--    descrição nunca é gravado duas vezes, nem de outro computador.
CREATE TABLE `automacao_execucoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receita` text NOT NULL,
	`receita_versao` integer DEFAULT 1 NOT NULL,
	`usuario_id` integer REFERENCES `usuarios`(`id`) ON DELETE set null,
	`usuario_nome` text,
	`estado` text DEFAULT 'preparada' NOT NULL,
	`ensaio` integer DEFAULT 0 NOT NULL,
	`entrada` text DEFAULT '{}' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`feitos` integer DEFAULT 0 NOT NULL,
	`falhas` integer DEFAULT 0 NOT NULL,
	`erro` text,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `automacao_execucoes_criado_idx` ON `automacao_execucoes` (`criado_em`);
--> statement-breakpoint
CREATE TABLE `automacao_passos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`execucao_id` integer NOT NULL REFERENCES `automacao_execucoes`(`id`) ON DELETE cascade,
	`ordem` integer DEFAULT 0 NOT NULL,
	`chave` text NOT NULL,
	`capacidade` text NOT NULL,
	`alvo` text,
	`estado` text DEFAULT 'fila' NOT NULL,
	`resultado` text,
	`erro` text,
	`inicio` text,
	`fim` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automacao_passos_chave_uq` ON `automacao_passos` (`execucao_id`,`chave`);
--> statement-breakpoint
CREATE TABLE `automacao_autorizacoes` (
	`id` text PRIMARY KEY NOT NULL,
	`execucao_id` integer NOT NULL REFERENCES `automacao_execucoes`(`id`) ON DELETE cascade,
	`passo_chave` text NOT NULL,
	`capacidade` text NOT NULL,
	`alvo_hash` text NOT NULL,
	`usuario_id` integer NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
	`expira_em` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `automacao_autorizacoes_expira_idx` ON `automacao_autorizacoes` (`expira_em`);
--> statement-breakpoint
CREATE TABLE `automacao_registros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`capacidade` text NOT NULL,
	`centi_alvo` text NOT NULL,
	`descricao` text NOT NULL,
	`centi_documento` text,
	`protocolo_id` integer REFERENCES `dfd_protocolos`(`id`) ON DELETE set null,
	`execucao_id` integer REFERENCES `automacao_execucoes`(`id`) ON DELETE set null,
	`usuario_id` integer REFERENCES `usuarios`(`id`) ON DELETE set null,
	`usuario_nome` text,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automacao_registros_alvo_uq` ON `automacao_registros` (`capacidade`,`centi_alvo`,`descricao`);
--> statement-breakpoint
CREATE INDEX `automacao_registros_protocolo_idx` ON `automacao_registros` (`protocolo_id`);
