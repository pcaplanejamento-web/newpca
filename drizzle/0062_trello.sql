-- INTEGRAÇÃO COM O TRELLO (sincronização nos dois sentidos, pela conta institucional). Aditiva — tabelas novas e vazias:
-- nada muda até um quadro ser ligado.
--   trello_quadros  = o quadro do PCA ligado a um board do Trello (+ webhook, campos personalizados criados, estado).
--   trello_vinculos = cada item ligado (lista/etiqueta/tarefa/checklist/item/comentário/anexo) + o RETRATO dos valores da
--                     última sincronização (a base da comparação campo a campo e do conflito).
--   trello_membros  = a pessoa do sistema ↔ o membro do Trello.
--   trello_fila     = o que falta sincronizar (saída PCA → Trello e entrada Trello → PCA); UM item por alvo.
CREATE TABLE `trello_quadros` (
	`quadro_id` integer PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`board_url` text,
	`webhook_id` text,
	`webhook_token_hash` text,
	`campos` text,
	`estado` text DEFAULT 'ativo' NOT NULL,
	`ultimo_erro` text,
	`sincronizado_em` text,
	`criado_por` integer,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`quadro_id`) REFERENCES `tarefa_quadros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trello_quadros_board_uq` ON `trello_quadros` (`board_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `trello_quadros_token_uq` ON `trello_quadros` (`webhook_token_hash`);
--> statement-breakpoint
CREATE TABLE `trello_vinculos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`local_id` integer NOT NULL,
	`trello_id` text NOT NULL,
	`retrato` text,
	`sincronizado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`quadro_id`) REFERENCES `trello_quadros`(`quadro_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trello_vinculos_local_uq` ON `trello_vinculos` (`tipo`,`local_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `trello_vinculos_trello_uq` ON `trello_vinculos` (`tipo`,`trello_id`);
--> statement-breakpoint
CREATE INDEX `trello_vinculos_quadro_idx` ON `trello_vinculos` (`quadro_id`);
--> statement-breakpoint
CREATE TABLE `trello_membros` (
	`usuario_id` integer PRIMARY KEY NOT NULL,
	`membro_id` text NOT NULL,
	`usuario_trello` text,
	`nome` text,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trello_membros_membro_uq` ON `trello_membros` (`membro_id`);
--> statement-breakpoint
CREATE TABLE `trello_fila` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quadro_id` integer NOT NULL,
	`direcao` text NOT NULL,
	`tipo` text NOT NULL,
	`alvo` text NOT NULL,
	`tentativas` integer DEFAULT 0 NOT NULL,
	`proxima_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`erro` text,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`quadro_id`) REFERENCES `trello_quadros`(`quadro_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trello_fila_alvo_uq` ON `trello_fila` (`direcao`,`tipo`,`alvo`);
--> statement-breakpoint
CREATE INDEX `trello_fila_proxima_idx` ON `trello_fila` (`proxima_em`);
