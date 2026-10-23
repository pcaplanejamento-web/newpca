-- v1.191.0: quem EMITIU (abriu ou baixou) o PDF do comprovante de cada aceite do Termo de Uso.
CREATE TABLE `termos_emissoes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `aceite_id` integer NOT NULL REFERENCES `termos_aceites`(`id`) ON DELETE cascade,
  `usuario_id` integer REFERENCES `usuarios`(`id`) ON DELETE set null,
  `nome` text NOT NULL,
  `ip` text DEFAULT '' NOT NULL,
  `modo` text NOT NULL,
  `em` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `termos_emissoes_aceite_idx` ON `termos_emissoes` (`aceite_id`);
