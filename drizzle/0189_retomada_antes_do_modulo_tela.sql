-- A 0188 zerou as conferências feitas com a lógica antiga, mas a RETOMADA ("Retomar de onde parou") guardava esses DFDs
-- como já feitos e os pulava. Apaga o que foi gravado na retomada ANTES do ar da v1.295.19 (fim do deploy, UTC); o que a
-- lógica nova já fez fica.
DELETE FROM `automacao_progresso` WHERE `em` < '2026-11-17 13:08:00';
