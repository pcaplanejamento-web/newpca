-- EXECUÇÃO DA DESPESA — a importação mais segura (aditiva): a SOMA empenhada de cada passo e do lote (conferida na
-- conclusão), a VERSÃO DO LEITOR que leu cada lote e cada empenho (o sistema avisa quando os dados vieram de um leitor
-- anterior) e a TRAVA de quem conduz o lote (uma aba por vez).
ALTER TABLE `centi_lote_passos` ADD `soma` real;
ALTER TABLE `centi_lotes` ADD `soma` real;
ALTER TABLE `centi_lotes` ADD `leitor` integer DEFAULT 0 NOT NULL;
ALTER TABLE `centi_lotes` ADD `condutor` text;
ALTER TABLE `centi_lotes` ADD `conduzindo_ate` text;
ALTER TABLE `empenhos` ADD `leitor` integer DEFAULT 0 NOT NULL;
-- O que já existe foi lido pelo leitor 1 (o da v1.188.1 — a migração 0133 apagou o que o leitor anterior tinha lido).
UPDATE `centi_lotes` SET `leitor` = 1;
UPDATE `empenhos` SET `leitor` = 1;
UPDATE `centi_lotes` SET `soma` = (SELECT SUM(`valor_empenhado`) FROM `empenhos_staging` s WHERE s.`lote_id` = `centi_lotes`.`id`) WHERE `estado` = 'lendo';
