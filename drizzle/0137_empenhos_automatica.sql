-- A ATUALIZAÇÃO AUTOMÁTICA dos empenhos (cron) existe: a API passa a poder ser LIGADA no cadastro — continua DESLIGADA
-- (`ativa` = 0) até o ADM ligar.
UPDATE `centi_apis` SET `implementada` = 1 WHERE `chave` = 'empenhos';
