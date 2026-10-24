-- SINCRONIA de liquidações e pagamentos com o cadastro (a mesma régua do empenho):
-- 1) a unidade que muda de ÓRGÃO leva junto as liquidações e os pagamentos dela (antes só os vínculos e os empenhos).
DROP TRIGGER IF EXISTS `empenho_vinculo_reparticao_orgao`;
--> statement-breakpoint
CREATE TRIGGER `empenho_vinculo_reparticao_orgao` AFTER UPDATE OF `orgao_id` ON `reparticoes` WHEN OLD.`orgao_id` IS NOT NEW.`orgao_id` AND NEW.`orgao_id` IS NOT NULL BEGIN
  UPDATE `empenho_card_vinculos` SET `orgao_id` = NEW.`orgao_id` WHERE `reparticao_id` = NEW.`id`;
  UPDATE `empenhos` SET `orgao_id` = NEW.`orgao_id` WHERE `reparticao_id` = NEW.`id`;
  UPDATE `liquidacoes` SET `orgao_id` = NEW.`orgao_id`, `atualizado_em` = CURRENT_TIMESTAMP WHERE `reparticao_id` = NEW.`id`;
  UPDATE `pagamentos` SET `orgao_id` = NEW.`orgao_id`, `atualizado_em` = CURRENT_TIMESTAMP WHERE `reparticao_id` = NEW.`id`;
  UPDATE `empenho_cards` SET `vinculos_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` IN (SELECT `card_id` FROM `empenho_card_vinculos` WHERE `reparticao_id` = NEW.`id`);
END;
--> statement-breakpoint
-- 2) o "ID na Centi" de um órgão que muda: as liquidações e os pagamentos SEM EMPENHO no sistema seguem o órgão que tem o
-- ID deles agora (os com empenho seguem o empenho). Sem nenhum órgão com o ID, ficam onde estão (nada é apagado).
DROP TRIGGER IF EXISTS `centi_orgao_id_alterado`;
--> statement-breakpoint
CREATE TRIGGER `centi_orgao_id_alterado` AFTER UPDATE OF `entidade_centi` ON `orgaos` WHEN OLD.`entidade_centi` IS NOT NEW.`entidade_centi` BEGIN
  UPDATE `liquidacoes` SET `orgao_id` = (SELECT MIN(o.`id`) FROM `orgaos` o WHERE CAST(TRIM(o.`entidade_centi`) AS INTEGER) = `liquidacoes`.`id_orgao_centi`), `atualizado_em` = CURRENT_TIMESTAMP
  WHERE `id_orgao_centi` > 0 AND `id_orgao_centi` IN (CAST(TRIM(IFNULL(OLD.`entidade_centi`, '')) AS INTEGER), CAST(TRIM(IFNULL(NEW.`entidade_centi`, '')) AS INTEGER))
    AND NOT EXISTS (SELECT 1 FROM `empenhos` e WHERE e.`numero` = `liquidacoes`.`numero_empenho` AND e.`orgao_id` IS NOT NULL)
    AND EXISTS (SELECT 1 FROM `orgaos` o WHERE CAST(TRIM(o.`entidade_centi`) AS INTEGER) = `liquidacoes`.`id_orgao_centi`)
    AND `orgao_id` IS NOT (SELECT MIN(o.`id`) FROM `orgaos` o WHERE CAST(TRIM(o.`entidade_centi`) AS INTEGER) = `liquidacoes`.`id_orgao_centi`);
  UPDATE `pagamentos` SET `orgao_id` = (SELECT MIN(o.`id`) FROM `orgaos` o WHERE CAST(TRIM(o.`entidade_centi`) AS INTEGER) = `pagamentos`.`id_orgao_centi`), `atualizado_em` = CURRENT_TIMESTAMP
  WHERE `id_orgao_centi` > 0 AND `id_orgao_centi` IN (CAST(TRIM(IFNULL(OLD.`entidade_centi`, '')) AS INTEGER), CAST(TRIM(IFNULL(NEW.`entidade_centi`, '')) AS INTEGER))
    AND NOT EXISTS (SELECT 1 FROM `empenhos` e WHERE e.`numero` = `pagamentos`.`numero_empenho` AND e.`orgao_id` IS NOT NULL)
    AND EXISTS (SELECT 1 FROM `orgaos` o WHERE CAST(TRIM(o.`entidade_centi`) AS INTEGER) = `pagamentos`.`id_orgao_centi`)
    AND `orgao_id` IS NOT (SELECT MIN(o.`id`) FROM `orgaos` o WHERE CAST(TRIM(o.`entidade_centi`) AS INTEGER) = `pagamentos`.`id_orgao_centi`);
END;
--> statement-breakpoint
-- A execução do EMPENHO (o banner do empenho lista as liquidações dele pelo número).
CREATE INDEX IF NOT EXISTS `liquidacoes_numero_empenho_idx` ON `liquidacoes` (`numero_empenho`);
