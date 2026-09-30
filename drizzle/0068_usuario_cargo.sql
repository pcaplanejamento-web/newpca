-- CARGO OU FUNÇÃO do usuário (aditiva): informado no cadastro; só o ADM altera depois. NULL nas contas antigas.
ALTER TABLE `usuarios` ADD `cargo` text;
