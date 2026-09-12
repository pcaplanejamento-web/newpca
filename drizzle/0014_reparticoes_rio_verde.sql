-- Semeia as repartições (órgãos/secretarias) da Prefeitura Municipal de Rio Verde.
-- Idempotente: cada repartição só é inserida se ainda não existir um `codigo`
-- igual (a tabela não tem índice único em `codigo`, então usamos WHERE NOT
-- EXISTS por linha — seguro de re-aplicar e sem duplicar o que o ADM já criou).
-- Depois concede a TODOS os grupos acesso a TODAS as repartições (o grupo
-- "Geral" passa a enxergar todas); o ADM pode restringir por grupo na tela.
-- Siglas oficiais confirmadas no site da Prefeitura (AMT/AMAE/IPARV/GCM/PROCON/
-- CGM/SETIA/GP); as demais seguem convenção usual e são editáveis em /painel/reparticoes.
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'GP', 'Gabinete do Prefeito', 1 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'GP');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'GVP', 'Gabinete do Vice-Prefeito', 2 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'GVP');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'CHEGAB', 'Chefia de Gabinete', 3 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'CHEGAB');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'PGM', 'Procuradoria Geral do Município', 4 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'PGM');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'CGM', 'Controladoria Geral do Município', 5 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'CGM');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'AMT', 'Agência Municipal de Mobilidade e Trânsito', 6 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'AMT');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'AMAE', 'Agência de Regulação dos Serviços Públicos de Saneamento Básico', 7 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'AMAE');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'IPARV', 'Instituto de Previdência e Assistência dos Servidores de Rio Verde', 8 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'IPARV');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'GCM', 'Guarda Civil Municipal', 9 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'GCM');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'PROCON', 'PROCON', 10 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'PROCON');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEPLAG', 'Secretaria de Planejamento e Gestão', 11 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEPLAG');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SMAS', 'Secretaria de Assistência Social', 12 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SMAS');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEFAZ', 'Secretaria da Fazenda', 13 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEFAZ');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SME', 'Secretaria de Educação', 14 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SME');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SMS', 'Secretaria de Saúde', 15 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SMS');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEAUSP', 'Secretaria de Ação Urbana e Serviços Públicos', 16 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEAUSP');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SIU', 'Secretaria de Infraestrutura Urbana', 17 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SIU');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SIR', 'Secretaria de Infraestrutura Rural', 18 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SIR');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SDES', 'Secretaria de Desenvolvimento Econômico Sustentável', 19 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SDES');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEAPA', 'Secretaria de Agricultura, Pecuária e Abastecimento', 20 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEAPA');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEL', 'Secretaria de Esportes e Lazer', 21 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEL');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEMMA', 'Secretaria de Meio Ambiente', 22 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEMMA');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SECOM', 'Secretaria de Comunicação Social', 23 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SECOM');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEC', 'Secretaria de Cultura', 24 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEC');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SEHAB', 'Secretaria de Habitação e Regularização Fundiária', 25 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SEHAB');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SETUR', 'Secretaria de Turismo', 26 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SETUR');
--> statement-breakpoint
INSERT INTO `reparticoes` (`codigo`, `nome`, `ordem`) SELECT 'SETIA', 'Secretaria de Tecnologia, Inovação e Inteligência Artificial', 27 WHERE NOT EXISTS (SELECT 1 FROM `reparticoes` WHERE `codigo` = 'SETIA');
--> statement-breakpoint
INSERT OR IGNORE INTO `grupo_reparticoes` (`grupo_id`, `reparticao_id`) SELECT `g`.`id`, `r`.`id` FROM `grupos` `g`, `reparticoes` `r`;
