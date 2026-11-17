-- As conferências feitas com o registro das seções 8 a 10 de RESERVA (o mesmo id para todos os planejamentos) trouxeram
-- as seções 8 a 10 de um só registro em todos os DFDs. A emissão agora manda o do próprio planejamento ou o campo vazio:
-- zera as marcações, os retratos e os PDFs guardados para conferir de novo.
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL, `conferencia_centi_aceite` = NULL WHERE `conferencia_centi` IS NOT NULL OR `conferencia_centi_aceite` IS NOT NULL OR `conferencia_centi_em` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `conferencias_centi_retrato`;
--> statement-breakpoint
DELETE FROM `conferencias_centi_pdf`;
