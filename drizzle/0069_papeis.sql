-- PAPÉIS (aditiva): o que a pessoa FAZ em cada tela — Visualizar · Manipular · Importar · Exportar · Excluir ·
-- Configurar. O GRUPO (com a permissão) decide QUAIS telas a pessoa abre; o PAPEL, as ações dentro de cada uma.
-- `capacidades` = JSON {tela: ações[]} (núcleo `papeis-core.ts`). `chave` = papel do SISTEMA (admin | gestor | membro;
-- NULL = criado pelo ADM). Os 3 papéis do sistema reproduzem as guardas de antes (Administrador e Gestor = tudo; Membro =
-- consulta + Tarefas/Calendário) e cada pessoa recebe o papel do `role` atual — ninguém ganha nem perde nada.
-- `usuarios.role` continua gravado como ESPELHO do papel (leitores antigos).
CREATE TABLE `papeis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`chave` text,
	`capacidades` text DEFAULT '{}' NOT NULL,
	`padrao_cadastro` integer DEFAULT 0 NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `papeis_nome_uq` ON `papeis` (`nome`);
--> statement-breakpoint
CREATE UNIQUE INDEX `papeis_chave_uq` ON `papeis` (`chave`);
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `papel_id` integer REFERENCES `papeis`(`id`) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `usuarios_papel_idx` ON `usuarios` (`papel_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `papeis` (`nome`, `descricao`, `chave`, `capacidades`, `padrao_cadastro`, `ordem`) VALUES
	('Administrador', 'Acesso total, inclusive a Administração. Papel fixo do sistema.', 'admin', '{"dfd":["visualizar","manipular","importar","exportar","excluir","configurar"],"pca":["visualizar","manipular","importar","exportar","excluir","configurar"],"catalogo":["visualizar","manipular","importar","exportar","excluir","configurar"],"orcamento":["visualizar","importar","exportar","excluir","configurar"],"tarefas":["visualizar","manipular","importar","exportar","excluir","configurar"],"calendario":["visualizar","manipular","importar","exportar","excluir"]}', 0, 0),
	('Gestor', 'Opera e configura as telas que o grupo libera.', 'gestor', '{"dfd":["visualizar","manipular","importar","exportar","excluir","configurar"],"pca":["visualizar","manipular","importar","exportar","excluir","configurar"],"catalogo":["visualizar","manipular","importar","exportar","excluir","configurar"],"orcamento":["visualizar","importar","exportar","excluir","configurar"],"tarefas":["visualizar","manipular","importar","exportar","excluir","configurar"],"calendario":["visualizar","manipular","importar","exportar","excluir"]}', 0, 1),
	('Membro', 'Consulta Mesa, PCA, Catálogo e Orçamento; trabalha em Tarefas e no Calendário.', 'membro', '{"dfd":["visualizar","exportar"],"pca":["visualizar","exportar"],"catalogo":["visualizar","exportar"],"orcamento":["visualizar","exportar"],"tarefas":["visualizar","manipular","exportar"],"calendario":["visualizar","manipular","importar","exportar"]}', 1, 2);
--> statement-breakpoint
UPDATE `usuarios` SET `papel_id` = (SELECT `id` FROM `papeis` WHERE `papeis`.`chave` = `usuarios`.`role`) WHERE `papel_id` IS NULL;
