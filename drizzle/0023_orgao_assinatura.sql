-- Órgão: MODO de assinatura (responsáveis por DFDs). `assinatura_unica`=1 → UMA configuração
-- de responsáveis vale para TODAS as unidades do órgão (guardada em `orgaos.responsavel_dfd`,
-- mesmo JSON de `reparticoes.responsavel_dfd`); =0 (PADRÃO) → cada unidade tem os seus
-- (comportamento atual, preservado). Migração ADITIVA — nada é perdido.
ALTER TABLE `orgaos` ADD `assinatura_unica` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orgaos` ADD `responsavel_dfd` text;
