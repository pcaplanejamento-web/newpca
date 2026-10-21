-- v1.144.0 — o grupo LIGA/DESLIGA as funções (abas, visões) de cada tela (JSON string[] das chaves "tela.funcao"
-- desligadas; vazio = todas) e escolhe os ORÇAMENTOS que acessa (JSON number[]; NULL = todos), como já faz com os PCAs.
ALTER TABLE grupos ADD COLUMN funcoes_off text;
ALTER TABLE grupos ADD COLUMN orcamentos text;
