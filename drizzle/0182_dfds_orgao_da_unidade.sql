-- 0182 (v1.289.5): o ÓRGÃO do DFD acompanha a UNIDADE. A unidade que mudava de órgão (ex.: os Fundos reorganizados) não
-- regravava `dfds.orgao_id` — as automações procuravam o DFD na CM002 do órgão antigo ("Não encontrado na CM002").
-- 1) Acerta os gravados: o DFD com unidade passa ao órgão ATUAL dela (sem unidade ou unidade sem órgão, fica como está).
UPDATE `dfds` SET `orgao_id` = (SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`id` = `dfds`.`reparticao_id`)
WHERE `reparticao_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `reparticoes` r WHERE r.`id` = `dfds`.`reparticao_id` AND r.`orgao_id` IS NOT NULL AND r.`orgao_id` IS NOT `dfds`.`orgao_id`);
--> statement-breakpoint
-- 2) Daqui em diante: a unidade que muda de órgão leva junto os DFDs dela (por qualquer caminho — tela, promover, rebaixar).
DROP TRIGGER IF EXISTS `dfd_reparticao_orgao`;
--> statement-breakpoint
CREATE TRIGGER `dfd_reparticao_orgao` AFTER UPDATE OF `orgao_id` ON `reparticoes` WHEN OLD.`orgao_id` IS NOT NEW.`orgao_id` AND NEW.`orgao_id` IS NOT NULL BEGIN
  UPDATE `dfds` SET `orgao_id` = NEW.`orgao_id` WHERE `reparticao_id` = NEW.`id`;
END;
