-- Indício de janela anônima/privada ao nomear o aparelho (só o ADM vê). NULL = sem leitura (aparelhos antigos).
ALTER TABLE `aparelhos` ADD `indicio_anonimo` text;
