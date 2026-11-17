-- A conferência DFD × Centi emitia o DFD com a chave "Emitir valor de referência" do aparelho: desligada, a Centi devolvia
-- a seção 4 sem as colunas VALOR UNITÁRIO/VALOR TOTAL e a comparação apontava "R$ 0,00 na Centi". Agora a conferência
-- sempre emite com o valor de referência: zera as marcações, os retratos, os PDFs e a retomada para conferir de novo.
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL, `conferencia_centi_aceite` = NULL WHERE `conferencia_centi` IS NOT NULL OR `conferencia_centi_aceite` IS NOT NULL OR `conferencia_centi_em` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `conferencias_centi_retrato`;
--> statement-breakpoint
DELETE FROM `conferencias_centi_pdf`;
--> statement-breakpoint
DELETE FROM `automacao_progresso`;
