-- A tela EXECUÇÃO (o dashboard de empenhos, liquidações e pagamentos): permissão própria. Sem tabela nova — os dados são
-- os dos cards; cada etapa no dashboard ainda exige a tela dela (Empenhos, Liquidações, Pagamentos).
-- Os papéis ganham na Execução o que têm em Empenhos, só do que a tela tem (visualizar e exportar).
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.execucao', (
  SELECT json_group_array(value) FROM json_each(`papeis`.`capacidades`, '$.empenhos') WHERE value IN ('visualizar', 'exportar')))
WHERE json_valid(`capacidades`) AND json_type(`capacidades`, '$.empenhos') = 'array' AND json_extract(`capacidades`, '$.execucao') IS NULL;
--> statement-breakpoint
-- … os grupos que abrem Empenhos (pelas telas avulsas) também abrem a Execução.
UPDATE `grupos` SET `abas` = json_insert(`abas`, '$[#]', 'execucao')
WHERE json_valid(`abas`) AND EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'empenhos')
  AND NOT EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'execucao');
--> statement-breakpoint
-- … e os MÓDULOS do ADM que têm Empenhos ganham a Execução.
UPDATE `configuracoes` SET `dados` = json_set(`dados`, '$.modulos', (
  SELECT json_group_array(json(CASE
    WHEN EXISTS (SELECT 1 FROM json_each(m.value, '$.telas') WHERE value = 'empenhos') AND NOT EXISTS (SELECT 1 FROM json_each(m.value, '$.telas') WHERE value = 'execucao')
    THEN json_set(m.value, '$.telas', json_insert(json_extract(m.value, '$.telas'), '$[#]', 'execucao'))
    ELSE m.value END))
  FROM json_each(`configuracoes`.`dados`, '$.modulos') m))
WHERE json_valid(`dados`) AND json_type(`dados`, '$.modulos') = 'array';
