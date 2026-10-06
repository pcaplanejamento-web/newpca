-- Situação do PLANEJAMENTO na Centi (tela CM002 — Executado, Cancelado…), lida pela Automação "Verificar execução".
-- Aditiva: NULL = ainda não verificado.
ALTER TABLE `dfds` ADD `execucao_centi` text;
--> statement-breakpoint
ALTER TABLE `dfds` ADD `execucao_centi_em` text;
