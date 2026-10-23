-- APIS DA CENTI: o escopo pelo CADASTRO do sistema (aditiva). `orgaos`/`unidades` = ids de `orgaos`/`reparticoes`
-- ('[]' = todos). Nas APIs pedidas por órgão, o idOrgao vem do "ID da entidade na Centi" de cada órgão escolhido
-- (Órgãos e Unidades) — a lista digitada deixa de valer para elas (fica só para as fontes dos contratos).
ALTER TABLE `centi_apis` ADD COLUMN `orgaos` text DEFAULT '[]' NOT NULL;
ALTER TABLE `centi_apis` ADD COLUMN `unidades` text DEFAULT '[]' NOT NULL;
UPDATE `centi_apis` SET `lista` = '[]' WHERE `divisao` = 'orgao';
