-- A automação emitia o DFD da Centi com a ASSINATURA de outro planejamento (IdPlanejamentoAssinaturaDFD fixo): as seções 8 a
-- 10 vinham do registro errado e as conferências "Convergente"/"Divergente" e os retratos feitos assim não provam nada.
-- Zera a marcação de todos os DFDs e apaga os retratos (o histórico em `conferencias_centi` fica).
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL, `conferencia_centi_aceite` = NULL WHERE `conferencia_centi` IS NOT NULL OR `conferencia_centi_aceite` IS NOT NULL OR `conferencia_centi_em` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `conferencias_centi_retrato`;
