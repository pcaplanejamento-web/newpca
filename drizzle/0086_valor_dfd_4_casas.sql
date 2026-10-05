-- 0086 — VALOR do DFD com 4 casas (a precisão da Centi: o preço unitário tem até 4 casas — 36 × 80.204,5466 =
-- 2.887.363,6776). A 0085 fechou cada DFD AO CENTAVO; somar DFDs já arredondados criava diferença de R$ 0,01 entre a aba
-- DFDs e a aba Itens e contra a capa (3 de 68 protocolos). Só DADOS, idempotente: os DFDs COMPLETOS recebem a soma dos itens
-- com 4 casas (NULL quando ≤ 0); o gravado pela metade fica como está (a conferência o acusa).
UPDATE `dfds` SET `valor_total` = (
  SELECT CASE WHEN SUM(COALESCE(i.`valor_total`, 0)) > 0 THEN ROUND(SUM(COALESCE(i.`valor_total`, 0)), 4) END
  FROM `dfd_itens` i WHERE i.`dfd_id` = `dfds`.`id`
)
WHERE (SELECT COUNT(*) FROM `dfd_itens` i WHERE i.`dfd_id` = `dfds`.`id`) >= COALESCE(`dfds`.`total_itens`, 0);
