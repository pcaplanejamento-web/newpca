-- O login da Centi vale para o ADM logado em qualquer navegador: sai a autorização por navegador (a `0196`, de horas
-- atrás). A senha segue cifrada no banco e selada à chave da extensão em cada entrega.
DROP TABLE IF EXISTS `centi_login_chaves`;
