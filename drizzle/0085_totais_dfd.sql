-- 0085 — TOTAIS do DFD = os ITENS gravados (a regra única). Só DADOS, idempotente.
-- A importação gravava o total DECLARADO pelo navegador (o "TOTAL GERAL" do PDF); as edições recalculavam pela soma dos
-- itens — as telas que somam DFDs divergiam das que somam itens. Daqui em diante o servidor fecha os totais pelos itens
-- (`comandoTotaisDfd`); esta migração acerta os já gravados.
-- 1) O item SEM total, mas com quantidade e valor unitário, recebe q × vu ao centavo (a régua da edição).
UPDATE `dfd_itens` SET `valor_total` = ROUND(`quantidade` * `valor_unitario`, 2)
WHERE `valor_total` IS NULL AND `quantidade` IS NOT NULL AND `valor_unitario` IS NOT NULL;
--> statement-breakpoint
-- 2) Os DFDs COMPLETOS (todos os itens declarados gravados): nº de itens = os gravados; valor = a soma ao centavo (NULL
-- quando ≤ 0). O gravado pela metade (sobrescrita que falhou num lote) fica como está — a conferência o acusa
-- ("Gravação incompleta") até reenviar.
UPDATE `dfds` SET
  `total_itens` = (SELECT COUNT(*) FROM `dfd_itens` i WHERE i.`dfd_id` = `dfds`.`id`),
  `valor_total` = (
    SELECT CASE WHEN SUM(COALESCE(i.`valor_total`, 0)) > 0 THEN ROUND(SUM(COALESCE(i.`valor_total`, 0)), 2) END
    FROM `dfd_itens` i WHERE i.`dfd_id` = `dfds`.`id`
  )
WHERE (SELECT COUNT(*) FROM `dfd_itens` i WHERE i.`dfd_id` = `dfds`.`id`) >= COALESCE(`dfds`.`total_itens`, 0);
