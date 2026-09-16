-- Órgão › Unidade: hierarquia organizacional. Um ÓRGÃO (novo) fica ACIMA da
-- unidade (repartição); toda unidade pertence a um órgão. Campos de match
-- configuráveis: `orgaos.orgao_entidade` casa o "Órgão/Entidade" do DFD e
-- `reparticoes.setor_requisitante` casa o "Setor Requisitante" do DFD.
-- Migração 100% ADITIVA (sem DROP/RENAME) — o legado é PRESERVADO e adaptado:
-- as unidades já cadastradas são vinculadas ao órgão padrão semeado (a Prefeitura);
-- `setor_requisitante` começa NULL (o auto-match segue como hoje: sigla → nome → órgão).
CREATE TABLE `orgaos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`sigla` text NOT NULL,
	`orgao_entidade` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `orgaos_ordem_idx` ON `orgaos` (`ordem`);
--> statement-breakpoint
ALTER TABLE `reparticoes` ADD `orgao_id` integer REFERENCES orgaos(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `reparticoes` ADD `setor_requisitante` text;
--> statement-breakpoint
CREATE INDEX `reparticoes_orgao_idx` ON `reparticoes` (`orgao_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `orgaos` (`id`, `nome`, `sigla`, `orgao_entidade`, `ordem`) VALUES (1, 'Prefeitura Municipal de Rio Verde', 'PMRV', 'PREFEITURA MUNICIPAL DE RIO VERDE', 0);
--> statement-breakpoint
UPDATE `reparticoes` SET `orgao_id` = 1 WHERE `codigo` <> 'GERAL' AND `orgao_id` IS NULL;
