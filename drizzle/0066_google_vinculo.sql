-- LOGIN COM GOOGLE — conta Google VINCULADA ao usuário (aditiva). `google_sub` = o identificador ESTÁVEL da conta Google
-- (não muda se o e-mail mudar) — o login acha o usuário por ele mesmo com um e-mail diferente do cadastro; `google_email`
-- = o e-mail da conta, só para exibir no Perfil. Uma conta Google em UM usuário.
ALTER TABLE `usuarios` ADD `google_sub` text;
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `google_email` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_google_sub_uq` ON `usuarios` (`google_sub`);
