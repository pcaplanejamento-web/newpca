-- TERMO DE USO + APARELHOS DA CONTA (aditiva). Nada muda até o ADM pôr a implantação em Teste ou Ativo.
CREATE TABLE `termos_uso` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `versao` integer NOT NULL,
  `titulo` text NOT NULL,
  `texto_adm` text NOT NULL,
  `clausulas_auto` text,
  `texto_final` text,
  `hash` text,
  `estado` text DEFAULT 'rascunho' NOT NULL,
  `carencia_dias` integer DEFAULT 0 NOT NULL,
  `publicado_em` text,
  `publicado_por` text,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP),
  `atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
CREATE UNIQUE INDEX `termos_uso_versao_uq` ON `termos_uso` (`versao`);
CREATE TABLE `termos_aceites` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `usuario_id` integer REFERENCES `usuarios`(`id`) ON DELETE set null,
  `termo_id` integer NOT NULL REFERENCES `termos_uso`(`id`) ON DELETE cascade,
  `versao` integer NOT NULL,
  `hash` text NOT NULL,
  `nome` text NOT NULL,
  `matricula` text DEFAULT '' NOT NULL,
  `cargo` text DEFAULT '' NOT NULL,
  `unidade` text DEFAULT '' NOT NULL,
  `email` text NOT NULL,
  `ip` text DEFAULT '' NOT NULL,
  `navegador` text DEFAULT '' NOT NULL,
  `aparelho_id` integer,
  `aparelho_nome` text DEFAULT '' NOT NULL,
  `metodo` text NOT NULL,
  `codigo` text NOT NULL,
  `selo` text NOT NULL,
  `em` text NOT NULL,
  `teste` integer DEFAULT 0 NOT NULL
);
CREATE UNIQUE INDEX `termos_aceites_codigo_uq` ON `termos_aceites` (`codigo`);
CREATE UNIQUE INDEX `termos_aceites_usuario_termo_uq` ON `termos_aceites` (`usuario_id`, `termo_id`);
CREATE TABLE `termos_pendencias` (
  `usuario_id` integer NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `termo_id` integer NOT NULL REFERENCES `termos_uso`(`id`) ON DELETE cascade,
  `prazo` text NOT NULL,
  PRIMARY KEY (`usuario_id`, `termo_id`)
);
CREATE TABLE `aparelhos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `usuario_id` integer NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `hash` text NOT NULL,
  `nome` text NOT NULL,
  `navegador` text DEFAULT '' NOT NULL,
  `ip` text DEFAULT '' NOT NULL,
  `criado_em` text NOT NULL,
  `visto_em` text,
  `teste` integer DEFAULT 0 NOT NULL
);
CREATE UNIQUE INDEX `aparelhos_usuario_hash_uq` ON `aparelhos` (`usuario_id`, `hash`);
CREATE TABLE `aparelhos_conta` (
  `usuario_id` integer PRIMARY KEY NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `limite` integer,
  `troca_ate` text
);
ALTER TABLE sessoes ADD COLUMN aparelho_id integer REFERENCES aparelhos(id) ON DELETE set null;
