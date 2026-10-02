-- 0080 — VÍNCULOS DO ORÇAMENTO CRIADOS pelo usuário: uma unidade do CUBO pode ficar ligada a MAIS DE UMA unidade
-- cadastrada (cada vínculo com as suas AÇÕES). Converte sem perder nada: cada vínculo de hoje vira um vínculo "com as
-- DEMAIS ações" (`acoes` NULL) que mantém as ações de fora (`acoes_fora`) — o mesmo resultado de antes. `acoes` (JSON) =
-- as ações EXPLÍCITAS do vínculo; NULL = todas as demais (as que nenhum outro vínculo da unidade pegou, menos as de fora).
-- Os textos sem unidade (desvinculados) não são vínculo — saem.
DELETE FROM `orcamento_vinculos` WHERE `reparticao_id` IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `orcamento_vinculos_tipo_chave_uq`;
--> statement-breakpoint
ALTER TABLE `orcamento_vinculos` ADD `acoes` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `orcamento_vinculos_chave_rep_uq` ON `orcamento_vinculos` (`chave`,`reparticao_id`);
--> statement-breakpoint
CREATE INDEX `orcamento_vinculos_chave_idx` ON `orcamento_vinculos` (`chave`);
