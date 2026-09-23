-- 0033 — PCA como ESPAÇO próprio (card 4×5 → Dashboard · Orçamento · Mesa/Importação · Configuração).
-- 1) `pcas`: FONTE dos dados (`lista` = planilhas importadas | `protocolo` = DFDs vinculados via
--    protocolos), STATUS (`preview` | `publicado` — publicado aparece na tela inicial), CAPA do card
--    (data-URL WebP 4:5), data da publicação e a VISÃO do orçamento usada no comparativo.
-- 2) `unidades` (planilhas) passam a pertencer a um PCA (`pca_id`); a unicidade do código vira POR
--    PCA (a mesma unidade — ex.: SEMED — existe em cada ano).
-- 3) `pca_dfds`: o que se vincula ao PCA é o DFD — com a AÇÃO (incorporar/substituir/excluir), o DFD
--    substituído e quem/quando vinculou.
-- 4) `protocolo_situacoes`: a situação diz se o protocolo PODE ser movido para o PCA e em qual
--    CAMADA (preview/publicado) os DFDs dele contam.
-- 5) `orcamento_visoes`: "visões salvas" do orçamento (filtro por VÁRIOS valores de cada dimensão).
-- LEGADO: as planilhas atuais viram um PCA "lista pronta" PUBLICADO (a tela inicial não muda) e as
-- edições que já unem DFDs viram PCAs de fonte `protocolo`.
CREATE TABLE `orcamento_visoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`filtros` text DEFAULT '{}' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
ALTER TABLE `pcas` ADD `fonte` text DEFAULT 'lista' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pcas` ADD `status` text DEFAULT 'preview' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pcas` ADD `capa` text;
--> statement-breakpoint
ALTER TABLE `pcas` ADD `publicado_em` text;
--> statement-breakpoint
ALTER TABLE `pcas` ADD `orcamento_visao_id` integer REFERENCES orcamento_visoes(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `unidades` ADD `pca_id` integer REFERENCES pcas(id) ON DELETE cascade;
--> statement-breakpoint
DROP INDEX IF EXISTS `unidades_codigo_uq`;
--> statement-breakpoint
CREATE UNIQUE INDEX `unidades_pca_codigo_uq` ON `unidades` (`pca_id`,`codigo`);
--> statement-breakpoint
CREATE INDEX `unidades_pca_idx` ON `unidades` (`pca_id`);
--> statement-breakpoint
ALTER TABLE `pca_dfds` ADD `acao` text DEFAULT 'incorporar' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pca_dfds` ADD `substitui_dfd_id` integer;
--> statement-breakpoint
ALTER TABLE `pca_dfds` ADD `vinculado_por` integer REFERENCES usuarios(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `pca_dfds` ADD `vinculado_em` text;
--> statement-breakpoint
CREATE INDEX `pca_dfds_dfd_idx` ON `pca_dfds` (`dfd_id`);
--> statement-breakpoint
ALTER TABLE `protocolo_situacoes` ADD `permite_mover_pca` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `protocolo_situacoes` ADD `camada_pca` text DEFAULT 'preview' NOT NULL;
--> statement-breakpoint
UPDATE `pcas` SET `fonte` = 'protocolo' WHERE `id` IN (SELECT `pca_id` FROM `pca_dfds`);
--> statement-breakpoint
INSERT INTO `pcas` (`nome`, `ano`, `fonte`, `status`)
SELECT 'PCA ' || COALESCE((SELECT MAX(`ano_desejado`) FROM `itens`), CAST(strftime('%Y', 'now') AS integer)),
       COALESCE((SELECT MAX(`ano_desejado`) FROM `itens`), CAST(strftime('%Y', 'now') AS integer)),
       'lista', 'preview'
WHERE EXISTS (SELECT 1 FROM `unidades`)
  AND NOT EXISTS (SELECT 1 FROM `pcas` WHERE `ativo` = 1 AND `fonte` = 'lista');
--> statement-breakpoint
UPDATE `pcas` SET `status` = 'publicado', `publicado_em` = CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM `unidades`)
  AND `id` = COALESCE(
    (SELECT `id` FROM `pcas` WHERE `ativo` = 1 AND `fonte` = 'lista' ORDER BY `id` LIMIT 1),
    (SELECT MAX(`id`) FROM `pcas` WHERE `fonte` = 'lista')
  );
--> statement-breakpoint
UPDATE `unidades` SET `pca_id` = (SELECT `id` FROM `pcas` WHERE `fonte` = 'lista' AND `status` = 'publicado' ORDER BY `id` LIMIT 1)
WHERE `pca_id` IS NULL;
