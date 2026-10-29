-- IMPORTAÇÕES SEM TRAVA: as TENTATIVAS da leitura fragmentada da Centi (contadas ANTES do trabalho — a execução cortada
-- pelo limite de CPU vira uma tentativa contada, nunca um laço eterno) e a SITUAÇÃO de cada importação automática (a tela
-- do ADM mostra por que cada card/contrato não avança). Aditiva.
ALTER TABLE `centi_leituras` ADD `tentativas` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `importacoes_cron` (
	`chave` text PRIMARY KEY NOT NULL,
	`situacao` text NOT NULL,
	`erro` integer NOT NULL DEFAULT 0,
	`em` text NOT NULL,
	`desde` text NOT NULL
);
