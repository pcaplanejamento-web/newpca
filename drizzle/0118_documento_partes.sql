-- DOCUMENTOS em PEDAÇOS: o PDF passa da linha única de base64 (≤ 2 MB por linha no D1) para partes binárias de até 1 MB.
-- `partes` = 0 → o documento antigo, com o `conteudo` base64; `completo` = 0 → envio em andamento (fora da lista).
ALTER TABLE `documentos` ADD `partes` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `documentos` ADD `completo` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE `documento_partes` (
  `documento_id` integer NOT NULL REFERENCES `documentos`(`id`) ON DELETE CASCADE,
  `ordem` integer NOT NULL,
  `dados` blob NOT NULL,
  PRIMARY KEY (`documento_id`, `ordem`)
);
