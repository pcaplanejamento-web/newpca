-- DOCUMENTOS: PDFs guardados no sistema (até 100 KB cada, compactados no navegador). O conteúdo em base64.
CREATE TABLE `documentos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `nome` text NOT NULL,
  `nome_arquivo` text NOT NULL,
  `tamanho` integer NOT NULL,
  `tamanho_original` integer NOT NULL,
  `paginas` integer NOT NULL DEFAULT 0,
  `compactado` integer NOT NULL DEFAULT 0,
  `conteudo` text NOT NULL,
  `criado_por` integer REFERENCES `usuarios`(`id`) ON DELETE SET NULL,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `documentos_criado_em_idx` ON `documentos` (`criado_em`);
--> statement-breakpoint
-- A tela nova vai aos grupos que abrem o Catálogo; os papéis ganham nela as MESMAS ações que têm no Catálogo (sem Configurar).
UPDATE `grupos` SET `abas` = json_insert(`abas`, '$[#]', 'documentos')
WHERE json_valid(`abas`)
  AND EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'catalogo')
  AND NOT EXISTS (SELECT 1 FROM json_each(`grupos`.`abas`) WHERE value = 'documentos');
--> statement-breakpoint
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.documentos',
  (SELECT json_group_array(value) FROM json_each(`papeis`.`capacidades`, '$.catalogo') WHERE value <> 'configurar'))
WHERE json_valid(`capacidades`)
  AND EXISTS (SELECT 1 FROM json_each(`papeis`.`capacidades`, '$.catalogo') WHERE value = 'visualizar')
  AND json_extract(`capacidades`, '$.documentos') IS NULL;
