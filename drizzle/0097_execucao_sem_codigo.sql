-- A coluna Execução guarda o TEXTO da Situação da CM002. Os códigos numéricos gravados pelas rodadas antigas saem.
UPDATE dfds SET execucao_centi = NULL, execucao_centi_em = NULL
WHERE execucao_centi IS NOT NULL AND trim(execucao_centi) <> '' AND trim(execucao_centi) NOT GLOB '*[^0-9]*';
