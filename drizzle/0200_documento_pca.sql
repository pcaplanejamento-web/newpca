-- DOCUMENTO OFICIAL DO PCA (v1.313.0): a configuração de cada PCA (o ADM controla tudo — ligado, capa, seções, dados
-- automáticos, colunas, assinaturas) e o registro de cada EMISSÃO pública (código de verificação + selo SHA-256 dos
-- números e dos dados da emissão; o IP só como hash). Aditiva.
CREATE TABLE `pca_documentos` (
	`pca_id` integer PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_por_nome` text,
	FOREIGN KEY (`pca_id`) REFERENCES `pcas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pca_documento_emissoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`pca_id` integer NOT NULL,
	`emitido_em` text NOT NULL,
	`itens` integer NOT NULL,
	`valor` real NOT NULL,
	`dfds` integer NOT NULL,
	`dados_hash` text NOT NULL,
	`config_hash` text NOT NULL,
	`selo` text NOT NULL,
	`ip_hash` text,
	FOREIGN KEY (`pca_id`) REFERENCES `pcas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pca_documento_emissoes_codigo_uq` ON `pca_documento_emissoes` (`codigo`);
--> statement-breakpoint
CREATE INDEX `pca_documento_emissoes_pca_idx` ON `pca_documento_emissoes` (`pca_id`, `id`);
