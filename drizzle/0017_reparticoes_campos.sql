-- Repartições: campos para cadastro do NÚMERO DO INTERESSADO e do NOME DO
-- RESPONSÁVEL POR DFDs (informativos, editáveis em /painel/reparticoes). Ambos
-- nullable (o uso atual não muda; o ADM preenche quando quiser).
ALTER TABLE `reparticoes` ADD `numero_interessado` text;
--> statement-breakpoint
ALTER TABLE `reparticoes` ADD `responsavel_dfd` text;
