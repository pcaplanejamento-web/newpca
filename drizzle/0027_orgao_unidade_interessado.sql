-- Órgão/Unidade: Nº interessado no órgão, ocultar (soft-hide) e registrar o ÓRGÃO no DFD/protocolo.
-- Migração ADITIVA (só ADD COLUMN/CREATE INDEX) — nada é perdido; defaults preservam o legado.
-- Ponto 1/2/3: o ÓRGÃO também tem Nº interessado (o protocolo pode vir em nome do órgão OU da
-- unidade). A unicidade GLOBAL (entre órgãos e unidades) é conferida no app (rotas admin).
ALTER TABLE `orgaos` ADD `numero_interessado` text;
--> statement-breakpoint
-- Ponto 8: OCULTAR órgão/unidade com DFD/protocolo vinculado (não excluir) — some do uso futuro
-- (matchers, seletores) mas preserva o histórico. Default 0 = visível (comportamento atual).
ALTER TABLE `orgaos` ADD `oculto` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `reparticoes` ADD `oculto` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Ponto 4: o DFD registra o ÓRGÃO (identificado por "Órgão/Entidade") além da unidade.
ALTER TABLE `dfds` ADD `orgao_id` integer REFERENCES orgaos(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `dfds_orgao_idx` ON `dfds` (`orgao_id`);
--> statement-breakpoint
-- Ponto 2: o protocolo pode vir em nome do ÓRGÃO (interessado do órgão) — além da unidade.
ALTER TABLE `dfd_protocolos` ADD `orgao_id` integer REFERENCES orgaos(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `protocolos_dfd_orgao_idx` ON `dfd_protocolos` (`orgao_id`);
