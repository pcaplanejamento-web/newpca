-- v1.268.2: a coluna de DFD "Centro de Custo" (também nos Itens) existe desde já — a automação preenche a MESMA linha.
INSERT INTO `mesa_colunas` (`entidade`, `nome`, `chave`, `nos_itens`) VALUES ('dfd', 'Centro de Custo', 'centro de custo', 1)
  ON CONFLICT (`entidade`, `chave`) DO UPDATE SET `nos_itens` = 1;
