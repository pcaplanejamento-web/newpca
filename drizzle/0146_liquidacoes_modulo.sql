-- LIQUIDAÇÕES viram um MÓDULO próprio (tela Liquidações, com permissão própria): os cards ficam na MESMA tabela dos cards
-- de empenhos, com `tipo` 'liquidacoes' e a ORIGEM (`origem_id`) = o card de EMPENHOS de onde vêm os empenhos — a
-- liquidação só é gravada quando o empenho dela está nesse card e segue o vínculo dele (órgão e unidade do cadastro).
ALTER TABLE `empenho_cards` ADD `tipo` text DEFAULT 'empenhos' NOT NULL;
--> statement-breakpoint
ALTER TABLE `empenho_cards` ADD `origem_id` integer REFERENCES `empenho_cards`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `empenho_cards_tipo_idx` ON `empenho_cards` (`tipo`, `origem_id`);
--> statement-breakpoint
-- O que já foi importado nos cards de empenhos (as liquidações dentro do card, v1.208.0) vai para um card de liquidações
-- NOVO, com a mesma configuração do card de origem e a API de liquidações.
INSERT INTO `empenho_cards` (`nome`, `descricao`, `cor`, `url_base`, `endpoint`, `uf`, `tenant`, `parametros`, `anos`, `ativa`, `frequencia_min`, `dias_uteis`, `hora_inicio`, `hora_fim`, `queda_soma`, `queda_registros`, `removidos`, `configurado_em`, `criado_por`, `tipo`, `origem_id`)
SELECT substr(c.`nome`, 1, 46) || ' — liquidações', '', c.`cor`, c.`url_base`, 'getliquidacoes', c.`uf`, c.`tenant`, c.`parametros`, c.`anos`, 0, c.`frequencia_min`, c.`dias_uteis`, c.`hora_inicio`, c.`hora_fim`,
  c.`queda_soma`, c.`queda_registros`, c.`removidos`, CURRENT_TIMESTAMP, 'Migração', 'liquidacoes', c.`id`
FROM `empenho_cards` c
WHERE c.`tipo` = 'empenhos'
  AND (EXISTS (SELECT 1 FROM `centi_lotes` l WHERE l.`card_id` = c.`id` AND l.`modo` = 'liquidacoes') OR EXISTS (SELECT 1 FROM `liquidacoes` q WHERE q.`card_id` = c.`id`));
--> statement-breakpoint
UPDATE `centi_lotes` SET `card_id` = (SELECT n.`id` FROM `empenho_cards` n WHERE n.`tipo` = 'liquidacoes' AND n.`origem_id` = `centi_lotes`.`card_id`)
WHERE `modo` = 'liquidacoes' AND EXISTS (SELECT 1 FROM `empenho_cards` n WHERE n.`tipo` = 'liquidacoes' AND n.`origem_id` = `centi_lotes`.`card_id`);
--> statement-breakpoint
UPDATE `liquidacoes` SET `card_id` = (SELECT n.`id` FROM `empenho_cards` n WHERE n.`tipo` = 'liquidacoes' AND n.`origem_id` = `liquidacoes`.`card_id`)
WHERE EXISTS (SELECT 1 FROM `empenho_cards` n WHERE n.`tipo` = 'liquidacoes' AND n.`origem_id` = `liquidacoes`.`card_id`);
--> statement-breakpoint
-- A TELA nova: os papéis ganham nela o que têm em Empenhos.
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.liquidacoes', json_extract(`capacidades`, '$.empenhos'))
WHERE json_valid(`capacidades`) AND json_type(`capacidades`, '$.empenhos') = 'array' AND json_extract(`capacidades`, '$.liquidacoes') IS NULL;
--> statement-breakpoint
-- … e os grupos que abrem Empenhos (pelas telas avulsas) também abrem Liquidações.
UPDATE `grupos` SET `abas` = json_insert(`abas`, '$[#]', 'liquidacoes')
WHERE json_valid(`abas`) AND EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'empenhos')
  AND NOT EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'liquidacoes');
--> statement-breakpoint
-- … e os MÓDULOS do ADM que têm Empenhos ganham Liquidações logo ao lado.
UPDATE `configuracoes` SET `dados` = json_set(`dados`, '$.modulos', (
  SELECT json_group_array(json(CASE
    WHEN EXISTS (SELECT 1 FROM json_each(m.value, '$.telas') WHERE value = 'empenhos') AND NOT EXISTS (SELECT 1 FROM json_each(m.value, '$.telas') WHERE value = 'liquidacoes')
    THEN json_set(m.value, '$.telas', json_insert(json_extract(m.value, '$.telas'), '$[#]', 'liquidacoes'))
    ELSE m.value END))
  FROM json_each(`configuracoes`.`dados`, '$.modulos') m))
WHERE json_valid(`dados`) AND json_type(`dados`, '$.modulos') = 'array';
