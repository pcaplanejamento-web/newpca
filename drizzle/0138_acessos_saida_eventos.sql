-- HISTÓRICO DE ACESSO com SAÍDA: cada login liga-se à sessão (o começo do hash), acompanha a última atividade e grava a
-- saída (sair, inatividade). E os EVENTOS de cópia e captura de tela de cada pessoa (onde estava e o que copiou).
ALTER TABLE `acessos` ADD `sessao` text;
--> statement-breakpoint
ALTER TABLE `acessos` ADD `ultimo_em` text;
--> statement-breakpoint
ALTER TABLE `acessos` ADD `saida_em` text;
--> statement-breakpoint
ALTER TABLE `acessos` ADD `saida_motivo` text;
--> statement-breakpoint
CREATE INDEX `acessos_sessao_idx` ON `acessos` (`sessao`);
--> statement-breakpoint
CREATE TABLE `eventos_protecao` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `usuario_id` integer NOT NULL REFERENCES `usuarios`(`id`) ON DELETE cascade,
  `em` text NOT NULL,
  `tipo` text NOT NULL,
  `rota` text NOT NULL,
  `tela` text NOT NULL,
  `itens` text NOT NULL DEFAULT '',
  `texto` text,
  `tamanho` integer NOT NULL DEFAULT 0,
  `origem` text NOT NULL DEFAULT 'teclado',
  `navegador` text NOT NULL DEFAULT '',
  `ip` text
);
--> statement-breakpoint
CREATE INDEX `eventos_protecao_usuario_idx` ON `eventos_protecao` (`usuario_id`, `id`);
