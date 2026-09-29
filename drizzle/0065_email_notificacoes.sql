-- E-MAIL das notificações (Resend) — aditiva. Cada notificação do sino guarda quando o e-mail dela foi tratado
-- (`email_enviado_em`: enviado ou pulado — a pessoa não quer aquele tipo) e quantas tentativas falharam.
ALTER TABLE `notificacoes` ADD `email_enviado_em` text;
--> statement-breakpoint
ALTER TABLE `notificacoes` ADD `email_tentativas` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- As que já existiam NÃO viram e-mail (nada de enviar o histórico de uma vez).
UPDATE `notificacoes` SET `email_enviado_em` = CURRENT_TIMESTAMP;
--> statement-breakpoint
CREATE INDEX `notificacoes_email_idx` ON `notificacoes` (`email_enviado_em`, `id`);
