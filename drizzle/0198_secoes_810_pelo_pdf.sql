-- As seções 8 a 10 (equipe, secretário demandante, autorização) passam a ser decididas pelo PRÓPRIO PDF de cada DFD:
-- a v1.308.0 as pulava quando o load da Centi (a prévia do planejamento) não trazia o registro, mesmo com o PDF completo.
-- Os DFDs marcados "Convergente*" por essa regra voltam a "não conferido", sem retrato nem PDF, e a retomada sai — a
-- próxima verificação compara cada seção no PDF. Os divergentes cujo retrato foi gravado sem as seções 8 a 10 também
-- (a reconferência e a correção pelo retrato passariam a acusar/trocar seções que o motivo gravado não mostra).
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL WHERE `id` IN (SELECT `dfd_id` FROM `conferencias_centi_retrato` WHERE json_extract(`retrato`, '$.semSecoes810') = 1);
--> statement-breakpoint
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL WHERE `conferencia_centi` = 'convergente' AND (`conferencia_centi_motivo` LIKE '%Seções 8 a 10 não conferidas%' OR `conferencia_centi_motivo` LIKE '%Sem as seções 8 a 10 na Centi%');
--> statement-breakpoint
DELETE FROM `conferencias_centi_retrato` WHERE `dfd_id` IN (SELECT `id` FROM `dfds` WHERE `conferencia_centi` IS NULL);
--> statement-breakpoint
DELETE FROM `conferencias_centi_pdf` WHERE `dfd_id` IN (SELECT `id` FROM `dfds` WHERE `conferencia_centi` IS NULL);
--> statement-breakpoint
DELETE FROM `automacao_progresso`;
