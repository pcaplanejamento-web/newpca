-- Auditoria / histórico de alterações (APPEND-ONLY, de ponta a ponta): registra QUEM
-- (usuario_id + snapshot nome/email, para sobreviver à exclusão do usuário), O QUÊ
-- (acao + entidade + entidade_id + diff `antes`/`depois` em JSON) e QUANDO. Uma linha
-- por mutação relevante do sistema (importar/protocolar, criar/editar/excluir, login…).
-- FK usuario_id ON DELETE set null — o snapshot preserva a identidade do ator.
CREATE TABLE `auditoria` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usuario_id` integer,
	`usuario_nome` text,
	`usuario_email` text,
	`acao` text NOT NULL,
	`entidade` text NOT NULL,
	`entidade_id` integer,
	`resumo` text,
	`antes` text,
	`depois` text,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `auditoria_entidade_idx` ON `auditoria` (`entidade`,`entidade_id`);
--> statement-breakpoint
CREATE INDEX `auditoria_usuario_idx` ON `auditoria` (`usuario_id`);
--> statement-breakpoint
CREATE INDEX `auditoria_criado_idx` ON `auditoria` (`criado_em`);
