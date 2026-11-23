-- Os DFDs marcados "Convergente*" na v1.309.0 ("Seções 8 a 10 em branco no DFD da Centi") podem ter vindo de um PDF que a
-- automação emitiu SEM o registro das seções 8 a 10 (a Centi 3.0.216.217 abre só a prévia do planejamento) — outro PDF,
-- não o que a tela da Centi gera. Voltam a "não conferido" (o PDF lido fica guardado) e a retomada sai: a próxima
-- verificação emite com o registro que a tela usa.
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL WHERE `conferencia_centi` = 'convergente' AND `conferencia_centi_motivo` LIKE '%Seções 8 a 10 em branco no DFD da Centi%';
--> statement-breakpoint
DELETE FROM `automacao_progresso`;
