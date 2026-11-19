-- O LOGIN DA CENTI de cada ADM guardado no BANCO (a única fonte — a extensão deixa de guardar a senha). Aditiva.
CREATE TABLE IF NOT EXISTS `centi_logins` (
  `usuario_id` integer PRIMARY KEY NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `cifrado` text NOT NULL,
  `auto` integer DEFAULT 1 NOT NULL,
  `atualizado_em` text NOT NULL,
  `pausado_em` text,
  `motivo` text,
  `ultimo_uso_em` text
);
--> statement-breakpoint
-- Leva o login já guardado nas preferências (o formato antigo é lido e regravado no novo na 1ª leitura).
INSERT OR IGNORE INTO `centi_logins` (`usuario_id`, `cifrado`, `auto`, `atualizado_em`)
SELECT `usuario_id`, json_extract(`valor`, '$.dados'), 1, COALESCE(json_extract(`valor`, '$.em'), `atualizado_em`, CURRENT_TIMESTAMP)
FROM `preferencias_tabela`
WHERE `chave` = 'cofre:centi-login' AND json_valid(`valor`) AND json_type(`valor`, '$.dados') = 'text';
--> statement-breakpoint
DELETE FROM `preferencias_tabela` WHERE `chave` = 'cofre:centi-login';
