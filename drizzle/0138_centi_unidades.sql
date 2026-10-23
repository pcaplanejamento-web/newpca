-- UNIDADES DA CENTI ligadas ao CADASTRO (Órgãos e Unidades): cada par "Órgão gestor" + "Unidade orçamentária" que a Centi
-- devolve (empenhos — e, depois, liquidações e pagamentos) é registrado aqui e o ADM o VINCULA a um órgão cadastrado (e,
-- opcionalmente, a uma unidade dele). Só os registros de unidade VINCULADA são gravados; o resto é lido, conferido e
-- descartado. Sem chaves estrangeiras: os GATILHOS abaixo mantêm tudo coerente com o cadastro.
CREATE TABLE `centi_unidades` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `orgao_gestor` text NOT NULL,
  `unidade` text DEFAULT '' NOT NULL,
  `orgao_id` integer,
  `reparticao_id` integer,
  `registros` integer DEFAULT 0 NOT NULL,
  `ultimo_lote` integer,
  `ultimo_ano` integer,
  `visto_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `vinculado_em` text,
  `vinculado_por` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `centi_unidades_par_uq` ON `centi_unidades` (`orgao_gestor`, `unidade`);
--> statement-breakpoint
ALTER TABLE `centi_lotes` ADD `modo` text DEFAULT 'dados' NOT NULL;
--> statement-breakpoint
ALTER TABLE `centi_lotes` ADD `fora` integer;
--> statement-breakpoint
ALTER TABLE `empenhos` ADD `orgao_id` integer;
--> statement-breakpoint
ALTER TABLE `empenhos` ADD `reparticao_id` integer;
--> statement-breakpoint
CREATE INDEX `empenhos_unidade_idx` ON `empenhos` (`orgao_gestor`, `unidade_orcamentaria`);
--> statement-breakpoint
CREATE INDEX `empenhos_vinculo_idx` ON `empenhos` (`orgao_id`, `reparticao_id`);
--> statement-breakpoint
-- As unidades que os empenhos já gravados trazem.
INSERT INTO `centi_unidades` (`orgao_gestor`, `unidade`, `registros`, `ultimo_ano`)
SELECT `orgao_gestor`, IFNULL(`unidade_orcamentaria`, ''), COUNT(*), MAX(`ano`) FROM `empenhos` GROUP BY `orgao_gestor`, IFNULL(`unidade_orcamentaria`, '');
--> statement-breakpoint
-- O vínculo de antes (v1.197.0 — pela SIGLA do órgão) vira o vínculo ao ÓRGÃO, só quando UM órgão visível casa.
UPDATE `centi_unidades` SET
  `orgao_id` = (SELECT o.`id` FROM `orgaos` o WHERE o.`oculto` = 0 AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(o.`sigla`, '.', ''), ' ', ''), '-', ''), '/', '')) = UPPER(REPLACE(REPLACE(REPLACE(REPLACE(`centi_unidades`.`orgao_gestor`, '.', ''), ' ', ''), '-', ''), '/', ''))),
  `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  `vinculado_por` = 'Migração (pela sigla do órgão)'
WHERE (SELECT COUNT(*) FROM `orgaos` o WHERE o.`oculto` = 0 AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(o.`sigla`, '.', ''), ' ', ''), '-', ''), '/', '')) = UPPER(REPLACE(REPLACE(REPLACE(REPLACE(`centi_unidades`.`orgao_gestor`, '.', ''), ' ', ''), '-', ''), '/', ''))) = 1;
--> statement-breakpoint
UPDATE `empenhos` SET `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
--> statement-breakpoint
-- BANCO LIMPO: os empenhos de unidade sem vínculo saem (voltam ao vincular e importar de novo).
DELETE FROM `empenhos` WHERE `orgao_id` IS NULL;
--> statement-breakpoint
-- A UNIDADE cadastrada que sai: os vínculos dela se desfazem e os registros dela saem.
CREATE TRIGGER `centi_unidade_reparticao_excluida` BEFORE DELETE ON `reparticoes` BEGIN
  DELETE FROM `empenhos` WHERE `reparticao_id` = OLD.`id`;
  UPDATE `centi_unidades` SET `orgao_id` = NULL, `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), `vinculado_por` = 'Unidade excluída do cadastro' WHERE `reparticao_id` = OLD.`id`;
END;
--> statement-breakpoint
-- O ÓRGÃO cadastrado que sai: idem para tudo que estava nele.
CREATE TRIGGER `centi_unidade_orgao_excluido` BEFORE DELETE ON `orgaos` BEGIN
  DELETE FROM `empenhos` WHERE `orgao_id` = OLD.`id`;
  UPDATE `centi_unidades` SET `orgao_id` = NULL, `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), `vinculado_por` = 'Órgão excluído do cadastro' WHERE `orgao_id` = OLD.`id`;
END;
--> statement-breakpoint
-- A unidade que MUDA de órgão leva os vínculos e os registros para o órgão novo.
CREATE TRIGGER `centi_unidade_reparticao_orgao` AFTER UPDATE OF `orgao_id` ON `reparticoes` WHEN OLD.`orgao_id` IS NOT NEW.`orgao_id` BEGIN
  UPDATE `centi_unidades` SET `orgao_id` = NEW.`orgao_id`, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `reparticao_id` = NEW.`id`;
  UPDATE `empenhos` SET `orgao_id` = NEW.`orgao_id` WHERE `reparticao_id` = NEW.`id`;
END;
