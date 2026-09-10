DROP TABLE IF EXISTS `coluna_opcoes`;
--> statement-breakpoint
DROP TABLE IF EXISTS `linhas`;
--> statement-breakpoint
DROP TABLE IF EXISTS `colunas`;
--> statement-breakpoint
DROP TABLE IF EXISTS `tabelas`;
--> statement-breakpoint
DROP TABLE IF EXISTS `protocolo_opcoes`;
--> statement-breakpoint
DROP TABLE IF EXISTS `protocolos`;
--> statement-breakpoint
CREATE TABLE `tabelas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `colunas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tabela_id` integer NOT NULL,
	`nome` text NOT NULL,
	`tipo` text DEFAULT 'texto' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`tabela_id`) REFERENCES `tabelas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `colunas_tabela_idx` ON `colunas` (`tabela_id`);
--> statement-breakpoint
CREATE TABLE `coluna_opcoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coluna_id` integer NOT NULL,
	`valor` text NOT NULL,
	FOREIGN KEY (`coluna_id`) REFERENCES `colunas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coluna_opcoes_uq` ON `coluna_opcoes` (`coluna_id`,`valor`);
--> statement-breakpoint
CREATE TABLE `linhas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tabela_id` integer NOT NULL,
	`dados` text DEFAULT '{}' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`tabela_id`) REFERENCES `tabelas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `linhas_tabela_idx` ON `linhas` (`tabela_id`);
--> statement-breakpoint
INSERT INTO `tabelas` (`nome`,`ordem`) VALUES ('Distribuição de Protocolos', 0);
--> statement-breakpoint
INSERT INTO `colunas` (`tabela_id`,`nome`,`tipo`,`ordem`) VALUES (1,'Data','data',0),(1,'Protocolo','texto',1),(1,'Secretaria / Órgão','selecao',2),(1,'Natureza','selecao',3),(1,'Responsável','selecao',4),(1,'Situação','selecao',5),(1,'Distribuição','selecao',6);
--> statement-breakpoint
INSERT INTO `coluna_opcoes` (`coluna_id`,`valor`) VALUES (4,'INCLUSÃO 2027'),(4,'INCLUSÃO 2026'),(4,'EXCLUSÃO'),(6,'Em análise'),(6,'Em andamento'),(6,'Pendente'),(6,'Finalizado');
