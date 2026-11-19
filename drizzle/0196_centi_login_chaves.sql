-- Os NAVEGADORES autorizados a receber o login da Centi (a senha só sai SELADA à chave pública de um deles). Aditiva.
CREATE TABLE IF NOT EXISTS `centi_login_chaves` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `usuario_id` integer NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `impressao` text NOT NULL,
  `publica` text NOT NULL,
  `navegador` text NOT NULL,
  `sessao_id` integer,
  `criado_em` text NOT NULL,
  `usado_em` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `centi_login_chaves_uq` ON `centi_login_chaves` (`usuario_id`, `impressao`);
