-- A leitura fragmentada da atualização automática guarda as CHAVES já vistas na resposta (uma por linha): um registro que a
-- Centi repete em duas janelas da MESMA resposta conta como repetido (como na leitura inteira), nunca duas vezes.
ALTER TABLE `centi_leituras` ADD `vistas` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- A TRAVA da execução automática no lote (o cron roda DUAS vezes por minuto): uma execução por vez avança o lote — a 2ª
-- nunca começa a mesma página enquanto a 1ª ainda espera a Centi. Vence sozinha (a execução que caiu não prende o lote).
ALTER TABLE `centi_lotes` ADD `auto_ate` text;
