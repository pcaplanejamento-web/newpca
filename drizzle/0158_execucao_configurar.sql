-- A tela EXECUÇÃO ganha a ação CONFIGURAR (publicar visões dos filtros para todos e moderar as públicas). Os papéis que
-- CONFIGURAM Empenhos passam a configurar a Execução (a mesma régua da 0157). Sem tabela nova.
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.execucao', json_insert(json_extract(`capacidades`, '$.execucao'), '$[#]', 'configurar'))
WHERE json_valid(`capacidades`) AND json_type(`capacidades`, '$.execucao') = 'array'
  AND EXISTS (SELECT 1 FROM json_each(`papeis`.`capacidades`, '$.empenhos') WHERE value = 'configurar')
  AND NOT EXISTS (SELECT 1 FROM json_each(`papeis`.`capacidades`, '$.execucao') WHERE value = 'configurar');
