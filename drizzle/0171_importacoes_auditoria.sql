-- IMPORTAÇÕES (auditoria v1.264.0): o último AVANÇO da leitura fragmentada (os erros anteriores a ele não contam) e o
-- índice do PEDIDO nos passos (a página anterior do mesmo pedido, para pular a que não mudou, é achada sem varrer o lote).
-- Aditiva.
ALTER TABLE `centi_leituras` ADD `progresso_em` text;
--> statement-breakpoint
CREATE INDEX `centi_lote_passos_pedido_idx` ON `centi_lote_passos` (`lote_id`,`inicio`,`fim`,`pagina`);
