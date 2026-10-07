-- Conferência do DFD com a CM002 da Centi (Automação → Fluxos "Conferir DFDs × CM002"): convergente | divergente, o
-- motivo (as divergências) e quando. Aditiva: NULL = ainda não conferido.
ALTER TABLE `dfds` ADD `conferencia_centi` text;
--> statement-breakpoint
ALTER TABLE `dfds` ADD `conferencia_centi_motivo` text;
--> statement-breakpoint
ALTER TABLE `dfds` ADD `conferencia_centi_em` text;
