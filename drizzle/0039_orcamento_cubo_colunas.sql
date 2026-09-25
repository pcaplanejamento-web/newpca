-- 0039 — NOVO PADRÃO do CUBO: o relatório passou a trazer, por lançamento, a classificação
-- programática e a fonte de recurso — Função, Programa, Ação, Ficha e Fonte. Colunas de TEXTO
-- (nullable) em `orcamento_itens`. Aditiva: os orçamentos importados no padrão antigo seguem
-- válidos (as colunas novas ficam vazias até reimportar o CUBO novo).
ALTER TABLE `orcamento_itens` ADD `funcao` text;
--> statement-breakpoint
ALTER TABLE `orcamento_itens` ADD `programa` text;
--> statement-breakpoint
ALTER TABLE `orcamento_itens` ADD `acao` text;
--> statement-breakpoint
ALTER TABLE `orcamento_itens` ADD `ficha` text;
--> statement-breakpoint
ALTER TABLE `orcamento_itens` ADD `fonte` text;
