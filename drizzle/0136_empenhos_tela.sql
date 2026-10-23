-- EMPENHOS vira uma TELA comum (deixa a Administração): os papéis ganham nela o que têm no Orçamento (só Visualizar e
-- Exportar — a importação segue em Integrações, do ADM). Nenhum grupo ganha a tela sozinho: o ADM a põe num módulo.
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.empenhos',
  (SELECT json_group_array(value) FROM json_each(`papeis`.`capacidades`, '$.orcamento') WHERE value IN ('visualizar', 'exportar')))
WHERE json_valid(`capacidades`)
  AND EXISTS (SELECT 1 FROM json_each(`papeis`.`capacidades`, '$.orcamento') WHERE value = 'visualizar')
  AND json_extract(`capacidades`, '$.empenhos') IS NULL;
--> statement-breakpoint
-- As edições salvas da tabela seguem a tela: a chave deixa de ser da Administração.
UPDATE `edicoes_tabela` SET `chave` = 'empenhos:tabela' WHERE `chave` = 'admin:empenhos:tabela';
--> statement-breakpoint
UPDATE `preferencias_tabela` SET `chave` = 'padrao:empenhos:tabela' WHERE `chave` = 'padrao:admin:empenhos:tabela'
  AND NOT EXISTS (SELECT 1 FROM `preferencias_tabela` p2 WHERE p2.`usuario_id` = `preferencias_tabela`.`usuario_id` AND p2.`chave` = 'padrao:empenhos:tabela');
