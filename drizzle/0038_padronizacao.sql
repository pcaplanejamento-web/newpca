-- 0038 — PADRONIZAÇÃO dos itens (Catálogo → Unidades de medida | Classificações).
-- 1) CLASSIFICAÇÕES de item: nome + cor + ordem + PALAVRAS-CHAVE (JSON string[]) — a classificação AUTOMÁTICA dos
--    itens (DFDs e catálogo) pela descrição.
-- 2) UNIDADES DE MEDIDA: sigla + nome + SINÔNIMOS (JSON string[] — as outras grafias aceitas) + ordem e a
--    CLASSIFICAÇÃO que a unidade indica (vale quando a descrição não tem palavra-chave; excluir a classificação zera).
-- 100% ADITIVA: tabelas novas e vazias — nada muda até o primeiro cadastro.
CREATE TABLE `item_classificacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor` text DEFAULT '#64748b' NOT NULL,
	`palavras` text DEFAULT '[]' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `item_classificacoes_ordem_idx` ON `item_classificacoes` (`ordem`);
--> statement-breakpoint
CREATE TABLE `unidades_medida` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sigla` text NOT NULL,
	`nome` text NOT NULL,
	`sinonimos` text DEFAULT '[]' NOT NULL,
	`classificacao_id` integer REFERENCES item_classificacoes(id) ON DELETE set null,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `unidades_medida_ordem_idx` ON `unidades_medida` (`ordem`);
