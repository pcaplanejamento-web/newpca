-- TRAVA da sincronização com o Trello (aditiva): uma coisa por vez em cada quadro ligado (a ação da tela, os avisos do
-- Trello e a verificação a cada 5 minutos não correm juntas — duas passadas ao mesmo tempo criavam o mesmo item duas vezes).
-- NULL = livre; a trava vence sozinha (validade curta, renovada a cada item).
ALTER TABLE `trello_quadros` ADD `processando_ate` text;
