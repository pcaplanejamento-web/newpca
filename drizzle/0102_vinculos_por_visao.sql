-- 0102 — VÍNCULOS POR VISÃO do orçamento (aditiva). Os vínculos gravados ficam como estão e viram o PADRÃO
-- (`visao_id` NULL). Uma visão segue o padrão em cada unidade do CUBO até definir a unidade por conta própria: as chaves
-- dessas unidades ficam em `orcamento_visoes.vinculos_proprios` (JSON) e os vínculos dela levam o `visao_id`. Excluir a
-- visão leva os vínculos dela (cascade). A mesma unidade do CUBO + unidade cadastrada pode existir uma vez por visão.
ALTER TABLE `orcamento_vinculos` ADD `visao_id` integer REFERENCES `orcamento_visoes`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `orcamento_visoes` ADD `vinculos_proprios` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `orcamento_vinculos_chave_rep_uq`;
--> statement-breakpoint
CREATE UNIQUE INDEX `orcamento_vinculos_chave_rep_uq` ON `orcamento_vinculos` (`chave`,`reparticao_id`,IFNULL(`visao_id`, 0));
--> statement-breakpoint
CREATE INDEX `orcamento_vinculos_visao_idx` ON `orcamento_vinculos` (`visao_id`);
