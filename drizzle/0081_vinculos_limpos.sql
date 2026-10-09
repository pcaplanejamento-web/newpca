-- 0081 — VÍNCULOS DO ORÇAMENTO sempre LIMPOS no banco: um vínculo sem unidade cadastrada não é vínculo. Apaga os que
-- ficaram sem unidade e, daqui em diante, excluir uma unidade cadastrada (por qualquer caminho — a tela de unidades, a
-- exclusão do órgão, promover/rebaixar) apaga os vínculos dela ANTES (gatilho) — nada fica pendurado com NULL.
DELETE FROM `orcamento_vinculos` WHERE `reparticao_id` IS NULL;
--> statement-breakpoint
CREATE TRIGGER `orcamento_vinculos_unidade_excluida` BEFORE DELETE ON `reparticoes`
BEGIN
  DELETE FROM `orcamento_vinculos` WHERE `reparticao_id` = OLD.`id`;
END;
