-- 0077 — PROTOCOLO INCORPORADO EDITÁVEL: o PCA acompanha cada mudança. 100% ADITIVA.
-- `pca_dfds.protocolo_id` = o protocolo INCORPORADO por onde o DFD entrou no PCA (NULL = vínculo de edição legada, que a
-- sincronia nunca toca; sem FK: o DFD que muda de protocolo é ressincronizado por ele). `pca_itens` ganha o RETRATO do
-- item (código/descrição/unidade/nº do item — reencontra o nº depois que a regravação apagou o item) e `baixado_em` (o nº
-- perdeu o item de vez: item removido, DFD/protocolo saiu do PCA — inativo para sempre, nunca reaproveitado).
ALTER TABLE `pca_dfds` ADD `protocolo_id` integer;
--> statement-breakpoint
ALTER TABLE `pca_itens` ADD `codigo` text;
--> statement-breakpoint
ALTER TABLE `pca_itens` ADD `descricao` text;
--> statement-breakpoint
ALTER TABLE `pca_itens` ADD `unidade` text;
--> statement-breakpoint
ALTER TABLE `pca_itens` ADD `item` integer;
--> statement-breakpoint
ALTER TABLE `pca_itens` ADD `baixado_em` text;
--> statement-breakpoint
CREATE INDEX `pca_dfds_protocolo_idx` ON `pca_dfds` (`protocolo_id`);
--> statement-breakpoint
CREATE INDEX `pca_itens_dfd_idx` ON `pca_itens` (`dfd_id`);
--> statement-breakpoint
-- O vínculo de INCORPORAÇÃO: o protocolo do DFD, quando ele está incorporado a ESSE PCA.
UPDATE `pca_dfds` SET `protocolo_id` = (
  SELECT d.protocolo_id FROM dfds d JOIN dfd_protocolos p ON p.id = d.protocolo_id
  WHERE d.id = pca_dfds.dfd_id AND p.pca_id = pca_dfds.pca_id AND p.pca_incorporado_em IS NOT NULL
);
--> statement-breakpoint
-- O retrato dos nºs que têm item.
UPDATE `pca_itens` SET
  `codigo` = (SELECT i.codigo FROM dfd_itens i WHERE i.id = pca_itens.dfd_item_id),
  `descricao` = (SELECT i.descricao FROM dfd_itens i WHERE i.id = pca_itens.dfd_item_id),
  `unidade` = (SELECT i.unidade FROM dfd_itens i WHERE i.id = pca_itens.dfd_item_id),
  `item` = (SELECT i.item FROM dfd_itens i WHERE i.id = pca_itens.dfd_item_id)
WHERE `dfd_item_id` IS NOT NULL;
--> statement-breakpoint
-- Os nºs que já perderam o item (órfãos): baixados.
UPDATE `pca_itens` SET
  `baixado_em` = CURRENT_TIMESTAMP,
  `ativo` = 0,
  `inativado_em` = COALESCE(`inativado_em`, CURRENT_TIMESTAMP),
  `motivo` = COALESCE(`motivo`, 'Item removido do DFD')
WHERE `dfd_item_id` IS NULL;
