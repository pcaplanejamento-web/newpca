-- GRUPOS sem a tela Permissões (aditiva): as TELAS que o grupo abre passam a morar NO PRÓPRIO GRUPO (`grupos.abas`, JSON
-- das chaves de aba — copiado da permissão que o grupo usava) e o grupo escolhe os PCAs que acessa (`grupos.pcas`, JSON
-- de ids; NULL = todos — o comportamento de antes). A tabela `permissoes` e a coluna `grupos.permissao_id` ficam
-- DORMENTES (dados preservados, sem código).
ALTER TABLE `grupos` ADD `abas` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `grupos` ADD `pcas` text;
--> statement-breakpoint
UPDATE `grupos` SET `abas` = COALESCE((SELECT `p`.`abas` FROM `permissoes` AS `p` WHERE `p`.`id` = `grupos`.`permissao_id`), '[]');
