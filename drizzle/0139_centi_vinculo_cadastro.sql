-- O VÍNCULO com a Centi passa a morar NO CADASTRO (Órgãos e Unidades): a unidade escolhe a sua UNIDADE ORÇAMENTÁRIA da
-- Centi (`reparticoes.centi_unidade_id`) e o órgão, o seu ÓRGÃO GESTOR (`orgaos.centi_orgao_gestor`) — cada um no máximo
-- uma vez no sistema. `centi_unidades.orgao_id`/`reparticao_id` viram o vínculo CALCULADO (a unidade escolhida; senão o
-- órgão do órgão gestor), mantido pelos GATILHOS abaixo junto com os empenhos (o que fica sem vínculo SAI do banco).
-- Os gatilhos da 0138 saem (o vínculo era editado na própria tabela das unidades da Centi).
DROP TRIGGER IF EXISTS `centi_unidade_reparticao_excluida`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_unidade_orgao_excluido`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_unidade_reparticao_orgao`;
--> statement-breakpoint
ALTER TABLE `reparticoes` ADD `centi_unidade_id` integer;
--> statement-breakpoint
ALTER TABLE `orgaos` ADD `centi_orgao_gestor` text;
--> statement-breakpoint
-- O que já estava vinculado (0138/v1.198.0) passa ao cadastro: a unidade fica com a unidade orçamentária dela; o órgão,
-- com o órgão gestor ligado a ele inteiro (um por órgão gestor).
UPDATE `reparticoes` SET `centi_unidade_id` = (SELECT MIN(cu.`id`) FROM `centi_unidades` cu WHERE cu.`reparticao_id` = `reparticoes`.`id`);
--> statement-breakpoint
UPDATE `orgaos` SET `centi_orgao_gestor` = (
  SELECT g FROM (SELECT `orgao_gestor` AS g, MIN(`orgao_id`) AS o FROM `centi_unidades` WHERE `orgao_id` IS NOT NULL AND `reparticao_id` IS NULL GROUP BY `orgao_gestor`) WHERE o = `orgaos`.`id` ORDER BY g LIMIT 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reparticoes_centi_unidade_uq` ON `reparticoes` (`centi_unidade_id`) WHERE `centi_unidade_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `orgaos_centi_gestor_uq` ON `orgaos` (`centi_orgao_gestor`) WHERE `centi_orgao_gestor` IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_reparticao_nova` AFTER INSERT ON `reparticoes` WHEN NEW.`centi_unidade_id` IS NOT NULL BEGIN
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
  UPDATE `empenhos` SET
    `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')),
    `reparticao_id` = (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
  WHERE `orgao_id` IS NOT (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
     OR `reparticao_id` IS NOT (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_reparticao_editada` AFTER UPDATE OF `centi_unidade_id`, `orgao_id` ON `reparticoes` WHEN OLD.`centi_unidade_id` IS NOT NEW.`centi_unidade_id` OR (NEW.`centi_unidade_id` IS NOT NULL AND OLD.`orgao_id` IS NOT NEW.`orgao_id`) BEGIN
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
  UPDATE `empenhos` SET
    `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')),
    `reparticao_id` = (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
  WHERE `orgao_id` IS NOT (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
     OR `reparticao_id` IS NOT (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_reparticao_excluida` AFTER DELETE ON `reparticoes` WHEN OLD.`centi_unidade_id` IS NOT NULL BEGIN
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
  UPDATE `empenhos` SET
    `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')),
    `reparticao_id` = (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
  WHERE `orgao_id` IS NOT (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
     OR `reparticao_id` IS NOT (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_orgao_novo` AFTER INSERT ON `orgaos` WHEN NEW.`centi_orgao_gestor` IS NOT NULL BEGIN
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
  UPDATE `empenhos` SET
    `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')),
    `reparticao_id` = (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
  WHERE `orgao_id` IS NOT (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
     OR `reparticao_id` IS NOT (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_orgao_editado` AFTER UPDATE OF `centi_orgao_gestor` ON `orgaos` WHEN OLD.`centi_orgao_gestor` IS NOT NEW.`centi_orgao_gestor` BEGIN
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
  UPDATE `empenhos` SET
    `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')),
    `reparticao_id` = (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
  WHERE `orgao_id` IS NOT (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
     OR `reparticao_id` IS NOT (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `centi_vinculo_orgao_excluido` AFTER DELETE ON `orgaos` WHEN OLD.`centi_orgao_gestor` IS NOT NULL BEGIN
  UPDATE `centi_unidades` SET
    `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
    `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
    `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    `vinculado_por` = 'Órgãos e Unidades'
  WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
     OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
  DELETE FROM `empenhos` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
  UPDATE `empenhos` SET
    `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')),
    `reparticao_id` = (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
  WHERE `orgao_id` IS NOT (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
     OR `reparticao_id` IS NOT (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
END;
--> statement-breakpoint
UPDATE `centi_unidades` SET
  `reparticao_id` = (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`),
  `orgao_id` = COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`)),
  `vinculado_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  `vinculado_por` = 'Órgãos e Unidades'
WHERE `reparticao_id` IS NOT (SELECT r.`id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`)
   OR `orgao_id` IS NOT COALESCE((SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`centi_unidade_id` = `centi_unidades`.`id`), (SELECT o.`id` FROM `orgaos` o WHERE o.`centi_orgao_gestor` = `centi_unidades`.`orgao_gestor`));
--> statement-breakpoint
DELETE FROM `empenhos` WHERE NOT EXISTS (SELECT 1 FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '') AND cu.`orgao_id` IS NOT NULL);
--> statement-breakpoint
UPDATE `empenhos` SET
  `orgao_id` = (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')),
  `reparticao_id` = (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
WHERE `orgao_id` IS NOT (SELECT cu.`orgao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''))
   OR `reparticao_id` IS NOT (SELECT cu.`reparticao_id` FROM `centi_unidades` cu WHERE cu.`orgao_gestor` = `empenhos`.`orgao_gestor` AND cu.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, ''));
