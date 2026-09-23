-- 0035 — SEQUENCIAL do ITEM no PCA: ao INCORPORAR (permanente), cada item ganha um número ÚNICO dentro do PCA,
-- guardado em `pca_itens` (a numeração, com o estado ativo/inativo) e no PRÓPRIO item (`dfd_itens.pca_id` +
-- `pca_sequencial`). Retirar o item do PCA só INATIVA o número (nunca reaproveitado). 100% ADITIVA.
-- As colunas `protocolo_situacoes.permite_mover_pca`/`camada_pca` (0033) ficam DORMENTES: a situação não
-- interfere mais no PCA.
CREATE TABLE `pca_itens` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `pca_id` integer NOT NULL REFERENCES pcas(id) ON DELETE cascade,
  `sequencial` integer NOT NULL,
  `dfd_item_id` integer REFERENCES dfd_itens(id) ON DELETE set null,
  `dfd_id` integer REFERENCES dfds(id) ON DELETE set null,
  `protocolo_id` integer REFERENCES dfd_protocolos(id) ON DELETE set null,
  `ativo` integer DEFAULT 1 NOT NULL,
  `inativado_em` text,
  `inativado_por` integer REFERENCES usuarios(id) ON DELETE set null,
  `motivo` text,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pca_itens_pca_seq_uq` ON `pca_itens` (`pca_id`, `sequencial`);
--> statement-breakpoint
CREATE INDEX `pca_itens_item_idx` ON `pca_itens` (`dfd_item_id`);
--> statement-breakpoint
ALTER TABLE `dfd_itens` ADD `pca_id` integer REFERENCES pcas(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `dfd_itens` ADD `pca_sequencial` integer;
--> statement-breakpoint
-- Legado: numera os itens dos protocolos JÁ incorporados (por PCA, na ordem da incorporação).
INSERT INTO `pca_itens` (`pca_id`, `sequencial`, `dfd_item_id`, `dfd_id`, `protocolo_id`)
SELECT pd.pca_id, ROW_NUMBER() OVER (PARTITION BY pd.pca_id ORDER BY p.pca_incorporado_em, d.id, i.sequencial, i.id), i.id, d.id, p.id
FROM pca_dfds pd
JOIN dfds d ON d.id = pd.dfd_id
JOIN dfd_protocolos p ON p.id = d.protocolo_id AND p.pca_id = pd.pca_id AND p.pca_incorporado_em IS NOT NULL
JOIN dfd_itens i ON i.dfd_id = d.id
WHERE pd.acao <> 'excluir';
--> statement-breakpoint
UPDATE `dfd_itens` SET
  `pca_id` = (SELECT x.pca_id FROM pca_itens x WHERE x.dfd_item_id = dfd_itens.id),
  `pca_sequencial` = (SELECT x.sequencial FROM pca_itens x WHERE x.dfd_item_id = dfd_itens.id)
WHERE `id` IN (SELECT dfd_item_id FROM pca_itens WHERE dfd_item_id IS NOT NULL);
