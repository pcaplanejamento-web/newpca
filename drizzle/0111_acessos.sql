-- HISTÓRICO DE ACESSO: cada login (data/hora, dispositivo, canal, IP) + o último acesso da pessoa.
CREATE TABLE `acessos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `usuario_id` integer NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `em` text NOT NULL,
  `canal` text NOT NULL,
  `navegador` text NOT NULL,
  `ip` text,
  `aparelho` text NOT NULL,
  `novo` integer DEFAULT 0 NOT NULL
);
CREATE INDEX `acessos_usuario_idx` ON `acessos` (`usuario_id`, `id`);
ALTER TABLE usuarios ADD COLUMN ultimo_acesso_em text;
UPDATE usuarios SET ultimo_acesso_em = (SELECT MAX(COALESCE(s.visto_em, s.criado_em)) FROM sessoes s WHERE s.usuario_id = usuarios.id);
