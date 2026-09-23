-- 0030 — VÍNCULOS do ORÇAMENTO com o cadastro do sistema. O relatório CUBO traz Órgão e Unidade
-- como TEXTO próprio (ex.: "FUNDO MUNICIPAL DE EDUCACAO DE RIO VERDE", "2 - SECRETARIA MUNICIPAL
-- DE EDUCAÇÃO"). Cada texto distinto (normalizado em `chave`) é vinculado a UM órgão (`tipo`
-- 'orgao') ou a UMA unidade (`tipo` 'unidade') cadastrados. É GLOBAL (não por orçamento): o
-- vínculo vale para todos os orçamentos importados, inclusive os próximos anos.
-- Alvo NULL = sem vínculo; excluir o órgão/unidade zera o alvo (FK set null). Aditiva.
CREATE TABLE `orcamento_vinculos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`chave` text NOT NULL,
	`texto` text NOT NULL,
	`orgao_id` integer,
	`reparticao_id` integer,
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`orgao_id`) REFERENCES `orgaos`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reparticao_id`) REFERENCES `reparticoes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orcamento_vinculos_tipo_chave_uq` ON `orcamento_vinculos` (`tipo`,`chave`);
