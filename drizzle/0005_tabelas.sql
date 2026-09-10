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
INSERT INTO `colunas` (`tabela_id`,`nome`,`tipo`,`ordem`) VALUES
	(1,'Data','data',0),
	(1,'Protocolo','texto',1),
	(1,'Secretaria / Órgão','selecao',2),
	(1,'Natureza','selecao',3),
	(1,'Responsável','selecao',4),
	(1,'Situação','selecao',5),
	(1,'Distribuição','selecao',6);
--> statement-breakpoint
INSERT INTO `coluna_opcoes` (`coluna_id`,`valor`)
	SELECT id,'INCLUSÃO 2027' FROM `colunas` WHERE tabela_id=1 AND nome='Natureza'
	UNION ALL SELECT id,'INCLUSÃO 2026' FROM `colunas` WHERE tabela_id=1 AND nome='Natureza'
	UNION ALL SELECT id,'EXCLUSÃO' FROM `colunas` WHERE tabela_id=1 AND nome='Natureza'
	UNION ALL SELECT id,'Em análise' FROM `colunas` WHERE tabela_id=1 AND nome='Situação'
	UNION ALL SELECT id,'Em andamento' FROM `colunas` WHERE tabela_id=1 AND nome='Situação'
	UNION ALL SELECT id,'Pendente' FROM `colunas` WHERE tabela_id=1 AND nome='Situação'
	UNION ALL SELECT id,'Finalizado' FROM `colunas` WHERE tabela_id=1 AND nome='Situação';
