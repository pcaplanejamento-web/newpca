-- v1.139.0 — PCA de lista pronta: UM componente por UPLOAD e o SEQUENCIAL SAGRADO (nunca dois itens com o mesmo nº no PCA).
CREATE TABLE `pca_uploads` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `pca_id` integer NOT NULL REFERENCES `pcas`(`id`) ON DELETE cascade,
  `nome_arquivo` text,
  `criado_por` integer REFERENCES `usuarios`(`id`) ON DELETE set null,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `pca_uploads_pca_idx` ON `pca_uploads` (`pca_id`);
--> statement-breakpoint
ALTER TABLE `unidades` ADD `upload_id` integer REFERENCES `pca_uploads`(`id`) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE `itens` ADD `pca_id` integer;
--> statement-breakpoint
UPDATE `itens` SET `pca_id` = (SELECT u.`pca_id` FROM `unidades` u WHERE u.`id` = `itens`.`unidade_id`);
--> statement-breakpoint
INSERT INTO `pca_uploads` (`pca_id`, `nome_arquivo`, `criado_em`)
SELECT `pca_id`,
  CASE WHEN instr(COALESCE(`nome_arquivo`, ''), ' · ') > 0 THEN substr(`nome_arquivo`, 1, instr(`nome_arquivo`, ' · ') - 1) ELSE COALESCE(`nome_arquivo`, `codigo`) END,
  MIN(`criado_em`)
FROM `unidades` WHERE `pca_id` IS NOT NULL
GROUP BY `pca_id`, CASE WHEN instr(COALESCE(`nome_arquivo`, ''), ' · ') > 0 THEN substr(`nome_arquivo`, 1, instr(`nome_arquivo`, ' · ') - 1) ELSE COALESCE(`nome_arquivo`, `codigo`) END;
--> statement-breakpoint
UPDATE `unidades` SET `upload_id` = (
  SELECT p.`id` FROM `pca_uploads` p WHERE p.`pca_id` = `unidades`.`pca_id`
    AND p.`nome_arquivo` = CASE WHEN instr(COALESCE(`unidades`.`nome_arquivo`, ''), ' · ') > 0 THEN substr(`unidades`.`nome_arquivo`, 1, instr(`unidades`.`nome_arquivo`, ' · ') - 1) ELSE COALESCE(`unidades`.`nome_arquivo`, `unidades`.`codigo`) END
) WHERE `pca_id` IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `unidades_pca_codigo_uq`;
--> statement-breakpoint
CREATE UNIQUE INDEX `unidades_upload_codigo_uq` ON `unidades` (`upload_id`, `codigo`);
--> statement-breakpoint
CREATE INDEX `unidades_upload_idx` ON `unidades` (`upload_id`);
--> statement-breakpoint
CREATE INDEX `itens_pca_seq_idx` ON `itens` (`pca_id`, `sequencial`);
--> statement-breakpoint
CREATE TRIGGER `itens_sequencial_unico`
BEFORE INSERT ON `itens`
WHEN NEW.`sequencial` IS NOT NULL AND NEW.`pca_id` IS NOT NULL
  AND (EXISTS (SELECT 1 FROM `itens` i WHERE i.`pca_id` = NEW.`pca_id` AND i.`sequencial` = NEW.`sequencial`)
    OR EXISTS (SELECT 1 FROM `pca_itens` x WHERE x.`pca_id` = NEW.`pca_id` AND x.`sequencial` = NEW.`sequencial`))
BEGIN
  SELECT RAISE(ABORT, 'sequencial_duplicado');
END;
--> statement-breakpoint
CREATE TRIGGER `pca_itens_sequencial_unico`
BEFORE INSERT ON `pca_itens`
WHEN EXISTS (SELECT 1 FROM `itens` i WHERE i.`pca_id` = NEW.`pca_id` AND i.`sequencial` = NEW.`sequencial`)
BEGIN
  SELECT RAISE(ABORT, 'sequencial_duplicado');
END;
