-- v1.248.0 — DECLARAÇÕES: editar a declaração ainda NÃO exportada e travar ao EXPORTAR o PDF (aditiva). O gatilho
-- `declaracoes_travada` recusa ('declaracao_travada') mudar o retrato (`conteudo`) de uma declaração exportada ou
-- cancelada — a edição vai num lote com o UPDATE primeiro: travada, o lote inteiro volta (os itens ficam como estavam).
ALTER TABLE `declaracoes` ADD `editada_em` text;
--> statement-breakpoint
ALTER TABLE `declaracoes` ADD `editada_por_nome` text;
--> statement-breakpoint
ALTER TABLE `declaracoes` ADD `exportada_em` text;
--> statement-breakpoint
ALTER TABLE `declaracoes` ADD `exportada_por_nome` text;
--> statement-breakpoint
CREATE TRIGGER `declaracoes_travada`
BEFORE UPDATE OF `conteudo` ON `declaracoes`
WHEN OLD.exportada_em IS NOT NULL OR OLD.cancelada_em IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'declaracao_travada');
END;
