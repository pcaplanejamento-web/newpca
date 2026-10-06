-- O CHAT AO VIVO GUARDADO POR 7 DIAS (v1.15.0). `chat_mensagens` = as mensagens (a conversa pela chave do servidor:
-- g<grupo> | p<menor>-<maior> | c<id>); `chat_conversas` = por pessoa, as conversas dela (a última mensagem, o nome e os
-- membros da conversa em grupo, e até onde LEU — o ✓✓ e as não lidas). A limpeza do cron apaga o que passou de 7 dias.
CREATE TABLE `chat_mensagens` (
	`id` text PRIMARY KEY NOT NULL,
	`conversa` text NOT NULL,
	`de` integer NOT NULL,
	`texto` text NOT NULL,
	`resp` text,
	`em` integer NOT NULL,
	FOREIGN KEY (`de`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_mensagens_conversa_idx` ON `chat_mensagens` (`conversa`,`em`);
--> statement-breakpoint
CREATE INDEX `chat_mensagens_em_idx` ON `chat_mensagens` (`em`);
--> statement-breakpoint
CREATE TABLE `chat_conversas` (
	`conversa` text NOT NULL,
	`usuario_id` integer NOT NULL,
	`nome` text,
	`membros` text,
	`ultima_em` integer NOT NULL,
	`lida_ate` text,
	`lida_em` integer,
	PRIMARY KEY(`conversa`, `usuario_id`),
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_conversas_usuario_idx` ON `chat_conversas` (`usuario_id`,`ultima_em`);
--> statement-breakpoint
CREATE INDEX `chat_conversas_ultima_idx` ON `chat_conversas` (`ultima_em`);
