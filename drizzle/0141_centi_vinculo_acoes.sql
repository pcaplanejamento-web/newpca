-- VÍNCULO POR AÇÕES + NADA FORA DO VÍNCULO NO BANCO (v1.202.0).
-- 1) `centi_acoes` = as AÇÕES de cada unidade orçamentária da Centi (o catálogo que as leituras trazem) e, por ação, a
--    UNIDADE do cadastro a que ela pertence (`reparticao_id`, escolhido em Órgãos e Unidades — uma ação em UMA unidade).
--    O vínculo do empenho: a ação vinculada › a unidade orçamentária vinculada › o órgão do órgão gestor
--    (a VIEW `centi_vinculo_empenhos` — a MESMA régua dos gatilhos; a promoção usa a mesma expressão no código).
-- 2) A leitura só guarda no staging o que tem vínculo; o resto entra só pela CHAVE em `centi_staging_fora` (para conferir
--    a contagem com a Centi sem repetir) e sai ao fechar a importação. Aqui o staging aberto é limpo do que não tem vínculo.
CREATE TABLE `centi_acoes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `centi_unidade_id` integer NOT NULL REFERENCES `centi_unidades`(`id`) ON DELETE CASCADE,
  `acao` text DEFAULT '' NOT NULL,
  `reparticao_id` integer,
  `registros` integer DEFAULT 0 NOT NULL,
  `ultimo_lote` integer,
  `ultimo_ano` integer,
  `visto_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `vinculado_em` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `centi_acoes_uq` ON `centi_acoes` (`centi_unidade_id`, `acao`);
--> statement-breakpoint
CREATE INDEX `centi_acoes_reparticao_idx` ON `centi_acoes` (`reparticao_id`);
--> statement-breakpoint
CREATE TABLE `centi_staging_fora` (
  `lote_id` integer NOT NULL REFERENCES `centi_lotes`(`id`) ON DELETE CASCADE,
  `chave` text NOT NULL,
  PRIMARY KEY (`lote_id`, `chave`)
) WITHOUT ROWID;
--> statement-breakpoint
-- As ações que os empenhos já gravados trazem.
INSERT INTO `centi_acoes` (`centi_unidade_id`, `acao`, `registros`, `ultimo_ano`)
SELECT cu.`id`, IFNULL(e.`acao`, ''), COUNT(*), MAX(e.`ano`) FROM `empenhos` e JOIN `centi_unidades` cu ON cu.`orgao_gestor` = e.`orgao_gestor` AND cu.`unidade` = IFNULL(e.`unidade_orcamentaria`, '')
GROUP BY cu.`id`, IFNULL(e.`acao`, '');
--> statement-breakpoint
CREATE VIEW `centi_vinculo_empenhos` AS SELECT e.`id` AS `id`,
  COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`id` = (SELECT ca.`reparticao_id` FROM `centi_acoes` ca JOIN `centi_unidades` cu ON cu.`id` = ca.`centi_unidade_id` WHERE cu.`orgao_gestor` = e.`orgao_gestor` AND cu.`unidade` = IFNULL(e.`unidade_orcamentaria`, '') AND ca.`acao` = IFNULL(e.`acao`, '') AND ca.`reparticao_id` IS NOT NULL)), (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = e.`orgao_gestor` AND cu.`unidade` = IFNULL(e.`unidade_orcamentaria`, ''))) AS `orgao_id`,
  COALESCE((SELECT ca.`reparticao_id` FROM `centi_acoes` ca JOIN `centi_unidades` cu ON cu.`id` = ca.`centi_unidade_id` WHERE cu.`orgao_gestor` = e.`orgao_gestor` AND cu.`unidade` = IFNULL(e.`unidade_orcamentaria`, '') AND ca.`acao` = IFNULL(e.`acao`, '') AND ca.`reparticao_id` IS NOT NULL), (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = e.`orgao_gestor` AND cu.`unidade` = IFNULL(e.`unidade_orcamentaria`, ''))) AS `reparticao_id`
FROM `empenhos` e;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_reparticao_nova`;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_reparticao_nova` AFTER INSERT ON `reparticoes` WHEN NEW.`centi_unidade_id` IS NOT NULL BEGIN
  UPDATE `centi_acoes` SET `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `reparticao_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `reparticoes` r WHERE r.`id` = `centi_acoes`.`reparticao_id`);
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) IS NULL;
  UPDATE `empenhos` SET `orgao_id` = (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`), `reparticao_id` = (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`)
  WHERE `orgao_id` IS NOT (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) OR `reparticao_id` IS NOT (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_reparticao_editada`;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_reparticao_editada` AFTER UPDATE OF `centi_unidade_id`, `orgao_id` ON `reparticoes` WHEN OLD.`centi_unidade_id` IS NOT NEW.`centi_unidade_id` OR (OLD.`orgao_id` IS NOT NEW.`orgao_id` AND (NEW.`centi_unidade_id` IS NOT NULL OR EXISTS (SELECT 1 FROM `centi_acoes` WHERE `reparticao_id` = NEW.`id`))) BEGIN
  UPDATE `centi_acoes` SET `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `reparticao_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `reparticoes` r WHERE r.`id` = `centi_acoes`.`reparticao_id`);
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) IS NULL;
  UPDATE `empenhos` SET `orgao_id` = (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`), `reparticao_id` = (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`)
  WHERE `orgao_id` IS NOT (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) OR `reparticao_id` IS NOT (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_reparticao_excluida`;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_reparticao_excluida` AFTER DELETE ON `reparticoes` WHEN OLD.`centi_unidade_id` IS NOT NULL OR EXISTS (SELECT 1 FROM `centi_acoes` WHERE `reparticao_id` = OLD.`id`) BEGIN
  UPDATE `centi_acoes` SET `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `reparticao_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `reparticoes` r WHERE r.`id` = `centi_acoes`.`reparticao_id`);
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) IS NULL;
  UPDATE `empenhos` SET `orgao_id` = (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`), `reparticao_id` = (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`)
  WHERE `orgao_id` IS NOT (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) OR `reparticao_id` IS NOT (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_orgao_novo`;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_orgao_novo` AFTER INSERT ON `orgaos` WHEN NEW.`centi_orgao_gestor` IS NOT NULL BEGIN
  UPDATE `centi_acoes` SET `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `reparticao_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `reparticoes` r WHERE r.`id` = `centi_acoes`.`reparticao_id`);
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) IS NULL;
  UPDATE `empenhos` SET `orgao_id` = (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`), `reparticao_id` = (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`)
  WHERE `orgao_id` IS NOT (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) OR `reparticao_id` IS NOT (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_orgao_editado`;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_orgao_editado` AFTER UPDATE OF `centi_orgao_gestor` ON `orgaos` WHEN OLD.`centi_orgao_gestor` IS NOT NEW.`centi_orgao_gestor` BEGIN
  UPDATE `centi_acoes` SET `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `reparticao_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `reparticoes` r WHERE r.`id` = `centi_acoes`.`reparticao_id`);
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) IS NULL;
  UPDATE `empenhos` SET `orgao_id` = (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`), `reparticao_id` = (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`)
  WHERE `orgao_id` IS NOT (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) OR `reparticao_id` IS NOT (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_orgao_excluido`;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_orgao_excluido` AFTER DELETE ON `orgaos` WHEN OLD.`centi_orgao_gestor` IS NOT NULL BEGIN
  UPDATE `centi_acoes` SET `reparticao_id` = NULL, `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `reparticao_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `reparticoes` r WHERE r.`id` = `centi_acoes`.`reparticao_id`);
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) IS NULL;
  UPDATE `empenhos` SET `orgao_id` = (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`), `reparticao_id` = (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`)
  WHERE `orgao_id` IS NOT (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) OR `reparticao_id` IS NOT (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`);
END;
--> statement-breakpoint
-- O staging das importações abertas: o que não tem vínculo vira só a chave (a conferência segue certa).
INSERT OR IGNORE INTO `centi_staging_fora` (`lote_id`, `chave`)
SELECT s.`lote_id`, s.`chave` FROM `empenhos_staging` s WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = s.`orgao_gestor` AND cu.`unidade` = IFNULL(s.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
--> statement-breakpoint
DELETE FROM `empenhos_staging` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos_staging`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos_staging`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
--> statement-breakpoint
-- Banco limpo: o staging de importações já fechadas (não deveria haver) e os empenhos sem vínculo saem.
DELETE FROM `empenhos_staging` WHERE `lote_id` IN (SELECT `id` FROM `centi_lotes` WHERE `estado` <> 'lendo');
--> statement-breakpoint
DELETE FROM `empenhos` WHERE (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) IS NULL;
--> statement-breakpoint
UPDATE `empenhos` SET `orgao_id` = (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`), `reparticao_id` = (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`)
WHERE `orgao_id` IS NOT (SELECT v.`orgao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`) OR `reparticao_id` IS NOT (SELECT v.`reparticao_id` FROM `centi_vinculo_empenhos` v WHERE v.`id` = `empenhos`.`id`);
