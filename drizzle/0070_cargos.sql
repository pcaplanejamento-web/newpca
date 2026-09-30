-- CARGOS E FUNÇÕES cadastrados pelo ADM (Usuários → Cargos e funções): o cadastro escolhe um deles. A pessoa guarda o NOME
-- (`usuarios.cargo`, como já era) — renomear um cargo renomeia o das pessoas no mesmo lote. Semeia com os cargos já
-- informados (sem repetir, sem caixa).
CREATE TABLE `cargos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cargos_nome_uq` ON `cargos` (lower(`nome`));
--> statement-breakpoint
INSERT OR IGNORE INTO `cargos` (`nome`, `ordem`)
SELECT TRIM(`cargo`), 0 FROM `usuarios` WHERE `cargo` IS NOT NULL AND TRIM(`cargo`) <> '' GROUP BY lower(TRIM(`cargo`));
