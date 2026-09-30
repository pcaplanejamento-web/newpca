-- CADASTRO INSTITUCIONAL (aditiva): a UNIDADE em que a pessoa trabalha (escolhida no cadastro; só o ADM altera), a data
-- em que o E-MAIL institucional foi CONFIRMADO (código de 6 dígitos) e os CÓDIGOS de confirmação enviados por e-mail
-- (só o hash — nunca o código; UM por e-mail e finalidade: reenviar substitui o anterior).
ALTER TABLE `usuarios` ADD `reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `email_verificado_em` text;
--> statement-breakpoint
CREATE TABLE `codigos_email` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`finalidade` text NOT NULL,
	`codigo_hash` text NOT NULL,
	`tentativas` integer DEFAULT 0 NOT NULL,
	`expira_em` text NOT NULL,
	`enviado_em` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `codigos_email_uq` ON `codigos_email` (`email`,`finalidade`);
