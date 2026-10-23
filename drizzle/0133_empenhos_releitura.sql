-- v1.188.1: o leitor dos valores lia "100,000" (R$ 100, com as três casas da Centi) como cem mil — todo empenho abaixo de
-- R$ 1.000 entrou mil vezes maior. Os empenhos importados com o leitor antigo saem (a importação os lê de novo da Centi,
-- já corretos), com as tentativas, os passos e o staging; a "última leitura" dos empenhos volta a vazia.
DELETE FROM `empenhos`;
DELETE FROM `empenhos_staging`;
DELETE FROM `centi_lote_passos`;
DELETE FROM `centi_lotes`;
UPDATE `centi_apis` SET `ultima_execucao` = NULL, `ultimo_status` = NULL, `ultima_contagem` = NULL, `ultimo_total` = NULL WHERE `chave` = 'empenhos';
