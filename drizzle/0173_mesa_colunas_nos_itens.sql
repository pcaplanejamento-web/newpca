-- v1.268.0: a coluna de DFD da automação também na tabela de Itens (o item herda o valor do DFD dele).
ALTER TABLE `mesa_colunas` ADD `nos_itens` integer DEFAULT 0 NOT NULL;
