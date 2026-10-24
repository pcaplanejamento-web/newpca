-- LIQUIDAÇÕES PELO NÚMERO DO EMPENHO. O "ID na Centi" do órgão (Órgãos e Unidades) já é o `idOrgao` da API: a configuração
-- de órgãos por card sai (`liquidacao_card_orgaos`) e uma importação lê TODOS os órgãos com o ID cadastrado (a lista
-- fica no lote — `orgaos_centi`; cada "página" do lote é um órgão). A API não traz a unidade: o ÓRGÃO e a UNIDADE da
-- liquidação são os do EMPENHO de mesmo número (`numero_empenho` = `empenhos.numero`); sem o empenho, o órgão do cadastro
-- com o ID na Centi e sem unidade. O staging guarda o órgão da Centi de cada liquidação.
ALTER TABLE `centi_lotes` ADD `orgaos_centi` text;
--> statement-breakpoint
ALTER TABLE `liquidacoes_staging` ADD `id_orgao_centi` integer;
--> statement-breakpoint
CREATE INDEX `empenhos_numero_idx` ON `empenhos` (`numero`);
--> statement-breakpoint
-- As importações de liquidações por órgão ainda abertas são encerradas (o formato do lote mudou); o que leram sai do staging.
UPDATE `centi_lotes` SET `estado` = 'cancelado', `mensagem` = 'Encerrada: as liquidações passaram a ser importadas de todos os órgãos de uma vez.', `condutor` = NULL, `conduzindo_ate` = NULL, `concluido_em` = CURRENT_TIMESTAMP
WHERE `modo` = 'liquidacoes' AND `estado` = 'lendo';
--> statement-breakpoint
DELETE FROM `liquidacoes_staging` WHERE `lote_id` IN (SELECT `id` FROM `centi_lotes` WHERE `modo` = 'liquidacoes' AND `estado` <> 'lendo');
--> statement-breakpoint
DROP TABLE `liquidacao_card_orgaos`;
--> statement-breakpoint
-- As gravadas passam a seguir o empenho de mesmo número (o órgão e a unidade dele); sem o empenho, o órgão do cadastro com
-- o ID na Centi e sem unidade (sem esse órgão, fica o que estava).
UPDATE `liquidacoes` SET
  `orgao_id` = COALESCE(
    (SELECT e.`orgao_id` FROM `empenhos` e WHERE e.`numero` = `liquidacoes`.`numero_empenho` AND e.`orgao_id` IS NOT NULL ORDER BY e.`removido_em` IS NOT NULL, e.`reparticao_id` IS NULL, e.`id` LIMIT 1),
    (SELECT MIN(o.`id`) FROM `orgaos` o WHERE CAST(TRIM(o.`entidade_centi`) AS INTEGER) = `liquidacoes`.`id_orgao_centi`),
    `orgao_id`),
  `reparticao_id` = (SELECT e.`reparticao_id` FROM `empenhos` e WHERE e.`numero` = `liquidacoes`.`numero_empenho` AND e.`orgao_id` IS NOT NULL ORDER BY e.`removido_em` IS NOT NULL, e.`reparticao_id` IS NULL, e.`id` LIMIT 1);
