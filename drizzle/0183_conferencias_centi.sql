-- O HISTÓRICO da conferência DFD × Centi: uma linha a cada vez que o resultado de um DFD MUDA (status ou divergências).
-- A tela compara a conferência atual com a anterior (o que foi resolvido, o que é novo). Até 20 por DFD (as mais antigas saem).
CREATE TABLE `conferencias_centi` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `dfd_id` integer NOT NULL REFERENCES `dfds`(`id`) ON DELETE cascade,
  `status` text NOT NULL,
  `motivo` text,
  `em` text NOT NULL,
  `por_nome` text
);
--> statement-breakpoint
CREATE INDEX `conferencias_centi_dfd_idx` ON `conferencias_centi` (`dfd_id`, `id`);
--> statement-breakpoint
-- A conferência gravada hoje vira a 1ª linha do histórico de cada DFD.
INSERT INTO `conferencias_centi` (`dfd_id`, `status`, `motivo`, `em`)
SELECT `id`, `conferencia_centi`, `conferencia_centi_motivo`, COALESCE(`conferencia_centi_em`, CURRENT_TIMESTAMP) FROM `dfds` WHERE `conferencia_centi` IN ('convergente', 'divergente');
