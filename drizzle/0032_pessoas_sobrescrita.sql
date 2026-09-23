-- 0032 — PESSOAS (apelido) + RASTRO do DFD SOBRESCRITO entre protocolos.
-- 1) APELIDO do usuário (Perfil): o nome de exibição no sistema (colunas Responsável/Distribuição da
--    Mesa, seletores, cabeçalho). Sem apelido, vale o nome.
-- 2) PASSAGENS do DFD: quando um DFD é sobrescrito por um DFD de OUTRO protocolo (mesmo número), o
--    protocolo de onde ele SAIU guarda um retrato leve (planejamento/tipo/sigla/itens/valor da época) —
--    mostrado em cinza, separado, apontando o protocolo ATUAL do DFD (sempre o último da cadeia, pelo
--    DFD vivo). Um por (protocolo, nº do DFD); some quando o DFD volta a esse protocolo. Excluir o
--    protocolo apaga as passagens dele (cascade).
-- 100% ADITIVA (sem DROP/RENAME); os defaults NULL preservam o legado.
ALTER TABLE `usuarios` ADD `apelido` text;
--> statement-breakpoint
CREATE TABLE `dfd_passagens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`protocolo_id` integer NOT NULL,
	`dfd_numero` text NOT NULL,
	`planejamento` text,
	`tipo` text,
	`sigla` text,
	`total_itens` integer,
	`valor_total` real,
	`usuario_id` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`protocolo_id`) REFERENCES `dfd_protocolos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dfd_passagens_uq` ON `dfd_passagens` (`protocolo_id`,`dfd_numero`);
--> statement-breakpoint
CREATE INDEX `dfd_passagens_numero_idx` ON `dfd_passagens` (`dfd_numero`);
