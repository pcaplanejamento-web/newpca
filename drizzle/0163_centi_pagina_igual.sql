-- v1.242.0 — A ATUALIZAÇÃO AUTOMÁTICA NÃO REPROCESSA A PÁGINA IDÊNTICA (aditiva).
-- O passo guarda as chaves que mandou ao staging (com as iguais e as fora, todas as chaves da página) e o SHA-256 dos bytes
-- da resposta da Centi; a leitura fragmentada leva a assinatura até o passo final.
ALTER TABLE `centi_lote_passos` ADD `chaves_gravadas` text;
--> statement-breakpoint
ALTER TABLE `centi_lote_passos` ADD `assinatura_bruta` text;
--> statement-breakpoint
ALTER TABLE `centi_leituras` ADD `assinatura` text;
