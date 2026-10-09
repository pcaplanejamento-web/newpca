-- Automações por ADM: cada fluxo é do dono (o painel dele); o PÚBLICO aparece aos outros ADMs no painel lateral.
-- Os existentes eram compartilhados: ficam públicos (ninguém perde acesso) e seguem no painel de quem criou.
ALTER TABLE `automacao_fluxos` ADD `publico` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `automacao_fluxos` SET `publico` = 1;
--> statement-breakpoint
CREATE INDEX `automacao_fluxos_criado_por_idx` ON `automacao_fluxos` (`criado_por`);
