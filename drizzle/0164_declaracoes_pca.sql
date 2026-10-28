-- v1.244.0 — DECLARAÇÕES DO PCA (aditiva). Cada declaração atesta que os itens (total ou PARCIAL) constam de um PCA; o
-- RETRATO fica congelado em `conteudo` (JSON) com o SELO (SHA-256) e o CÓDIGO de verificação pública. `declaracao_itens`
-- guarda o quanto de cada item (pelo SEQUENCIAL do PCA — estável) foi declarado: o gatilho barra declarar além do SALDO
-- (a quantidade do item no PCA menos o já declarado nas declarações não canceladas), atômico mesmo com emissões juntas.
CREATE TABLE `declaracoes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `pca_id` integer NOT NULL REFERENCES `pcas`(`id`) ON DELETE CASCADE,
  `ano` integer NOT NULL,
  `numero` integer NOT NULL,
  `codigo` text NOT NULL,
  `finalidade` text NOT NULL,
  `processo` text,
  `observacao` text,
  `conteudo` text NOT NULL,
  `selo` text NOT NULL,
  `total_itens` integer NOT NULL,
  `valor_total` real NOT NULL,
  `emitido_por` integer REFERENCES `usuarios`(`id`) ON DELETE SET NULL,
  `emitido_por_nome` text NOT NULL,
  `emitido_em` text NOT NULL,
  `cancelada_em` text,
  `cancelada_por_nome` text,
  `motivo_cancelamento` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `declaracoes_codigo_uq` ON `declaracoes` (`codigo`);
--> statement-breakpoint
CREATE UNIQUE INDEX `declaracoes_ano_numero_uq` ON `declaracoes` (`ano`, `numero`);
--> statement-breakpoint
CREATE INDEX `declaracoes_pca_idx` ON `declaracoes` (`pca_id`, `id`);
--> statement-breakpoint
CREATE TABLE `declaracao_itens` (
  `declaracao_id` integer NOT NULL REFERENCES `declaracoes`(`id`) ON DELETE CASCADE,
  `pca_id` integer NOT NULL,
  `sequencial` integer NOT NULL,
  `quantidade` real NOT NULL,
  `quantidade_pca` real NOT NULL,
  PRIMARY KEY (`declaracao_id`, `sequencial`)
);
--> statement-breakpoint
CREATE INDEX `declaracao_itens_pca_seq_idx` ON `declaracao_itens` (`pca_id`, `sequencial`);
--> statement-breakpoint
CREATE TRIGGER `declaracao_itens_saldo`
BEFORE INSERT ON `declaracao_itens`
WHEN NEW.quantidade <= 0 OR NEW.quantidade > NEW.quantidade_pca + 0.000001 - COALESCE((
  SELECT SUM(di.quantidade) FROM `declaracao_itens` AS di JOIN `declaracoes` AS d ON d.id = di.declaracao_id
  WHERE di.pca_id = NEW.pca_id AND di.sequencial = NEW.sequencial AND d.cancelada_em IS NULL
), 0)
BEGIN
  SELECT RAISE(ABORT, 'saldo_insuficiente');
END;
