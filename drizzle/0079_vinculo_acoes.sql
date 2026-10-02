-- 0079 — VÍNCULOS DO ORÇAMENTO só por UNIDADE + as AÇÕES escolhidas. Aditiva: `acoes_fora` (JSON das chaves das ações
-- da unidade do CUBO que NÃO entram no vínculo; NULL = todas entram — os vínculos de hoje seguem iguais). O vínculo por
-- ÓRGÃO sai (ver por órgão = a soma das unidades vinculadas a ele).
ALTER TABLE `orcamento_vinculos` ADD `acoes_fora` text;
--> statement-breakpoint
DELETE FROM `orcamento_vinculos` WHERE `tipo` = 'orgao';
