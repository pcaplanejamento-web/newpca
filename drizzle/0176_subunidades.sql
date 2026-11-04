-- v1.269.0 — SUBUNIDADES por unidade + o CENTRO DE CUSTO como dado do DFD.
-- O tipo de VÍNCULO da unidade decide a subunidade de cada DFD: "proprio" (a própria unidade — padrão), "centro_custo"
-- (a subunidade cujo centro de custo confere com o do DFD) ou "marcado" (escolhida no DFD).
ALTER TABLE `reparticoes` ADD `vinculo_subunidade` text DEFAULT 'proprio' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `subunidades` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `reparticao_id` integer NOT NULL REFERENCES `reparticoes`(`id`) ON DELETE cascade,
  `nome` text NOT NULL,
  `ordem` integer DEFAULT 0 NOT NULL,
  `centros_custo` text DEFAULT '[]' NOT NULL,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `subunidades_reparticao_idx` ON `subunidades` (`reparticao_id`, `ordem`);
--> statement-breakpoint
ALTER TABLE `dfds` ADD `subunidade_id` integer REFERENCES `subunidades`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `dfds` ADD `centro_custo` text;
--> statement-breakpoint
ALTER TABLE `dfds` ADD `centro_custo_em` text;
--> statement-breakpoint
-- A unidade com o "Centro de Custo" cadastrado (0172) passa ao vínculo por centro de custo, com UMA subunidade
-- (o nome da unidade) ligada a ele. A coluna `reparticoes.centro_custo` fica DORMENTE.
INSERT INTO `subunidades` (`reparticao_id`, `nome`, `ordem`, `centros_custo`)
  SELECT `id`, `nome`, 0, json_array(trim(`centro_custo`)) FROM `reparticoes`
  WHERE trim(COALESCE(`centro_custo`, '')) <> ''
    AND NOT EXISTS (SELECT 1 FROM `subunidades` s WHERE s.`reparticao_id` = `reparticoes`.`id`);
--> statement-breakpoint
UPDATE `reparticoes` SET `vinculo_subunidade` = 'centro_custo'
  WHERE trim(COALESCE(`centro_custo`, '')) <> '';
--> statement-breakpoint
-- O texto que a automação gravou na coluna "Centro de Custo" da Mesa (0175) vai ao próprio DFD.
UPDATE `dfds` SET
  `centro_custo` = (SELECT v.`valor` FROM `mesa_colunas_valores` v JOIN `mesa_colunas` c ON c.`id` = v.`coluna_id`
                    WHERE c.`entidade` = 'dfd' AND c.`chave` = 'centro de custo' AND v.`alvo_id` = `dfds`.`id`),
  `centro_custo_em` = (SELECT v.`atualizado_em` FROM `mesa_colunas_valores` v JOIN `mesa_colunas` c ON c.`id` = v.`coluna_id`
                    WHERE c.`entidade` = 'dfd' AND c.`chave` = 'centro de custo' AND v.`alvo_id` = `dfds`.`id`)
  WHERE `id` IN (SELECT v.`alvo_id` FROM `mesa_colunas_valores` v JOIN `mesa_colunas` c ON c.`id` = v.`coluna_id`
                 WHERE c.`entidade` = 'dfd' AND c.`chave` = 'centro de custo');
--> statement-breakpoint
-- A coluna genérica sai (os valores caem pela cascata): o Centro de Custo é campo do DFD.
DELETE FROM `mesa_colunas` WHERE `entidade` = 'dfd' AND `chave` = 'centro de custo';
