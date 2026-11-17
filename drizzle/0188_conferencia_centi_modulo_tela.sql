-- A automação abria o planejamento por um módulo da Centi (101026) que não traz o registro das seções 8 a 10 do DFD
-- (IdPlanejamentoAssinaturaDFD) e emitia com um id fixo ou vazio: as seções 8 a 10 vinham de outro planejamento ou em
-- branco. Agora abre como a TELA da Centi (101045) e manda o registro do próprio planejamento: zera as marcações, os
-- retratos e os PDFs guardados para conferir de novo.
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL, `conferencia_centi_aceite` = NULL WHERE `conferencia_centi` IS NOT NULL OR `conferencia_centi_aceite` IS NOT NULL OR `conferencia_centi_em` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `conferencias_centi_retrato`;
--> statement-breakpoint
DELETE FROM `conferencias_centi_pdf`;
