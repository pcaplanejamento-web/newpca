-- A VERIFICAÇÃO vira uma tela própria do grupo (antes seguia a Mesa). Ninguém perde acesso: os grupos que abrem a Mesa
-- ganham a Verificação, e os papéis que visualizam a Mesa ganham Visualizar (+ Exportar, se exportam na Mesa) nela.
UPDATE `grupos` SET `abas` = json_insert(`abas`, '$[#]', 'verificacao')
WHERE json_valid(`abas`)
  AND EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'dfd')
  AND NOT EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'verificacao');
--> statement-breakpoint
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.verificacao',
  CASE WHEN EXISTS (SELECT 1 FROM json_each(`papeis`.`capacidades`, '$.dfd') WHERE value = 'exportar')
       THEN json_array('visualizar', 'exportar') ELSE json_array('visualizar') END)
WHERE json_valid(`capacidades`)
  AND EXISTS (SELECT 1 FROM json_each(`papeis`.`capacidades`, '$.dfd') WHERE value = 'visualizar')
  AND json_extract(`capacidades`, '$.verificacao') IS NULL;
