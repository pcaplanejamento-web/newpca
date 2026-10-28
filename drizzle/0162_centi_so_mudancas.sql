-- v1.241.0 — A IMPORTAÇÃO DA CENTI SÓ GRAVA O QUE MUDOU.
-- (1) As chaves dos registros IGUAIS ao gravado e as dos SEM VÍNCULO/DESTINO passam a ser uma LISTA por página (no passo —
--     uma escrita por página, em vez de uma linha por registro em `centi_staging_fora`, que sai). As importações abertas
--     usam o formato anterior: são encerradas (nada foi gravado nos dados; importe de novo) e o staging delas sai.
UPDATE `centi_lotes` SET `estado` = 'cancelado', `mensagem` = 'Encerrada: a importação passou a gravar só o que mudou — importe de novo.', `condutor` = NULL, `conduzindo_ate` = NULL, `auto_ate` = NULL, `concluido_em` = CURRENT_TIMESTAMP
WHERE `estado` = 'lendo';
--> statement-breakpoint
DELETE FROM `empenhos_staging`;
--> statement-breakpoint
DELETE FROM `liquidacoes_staging`;
--> statement-breakpoint
DELETE FROM `pagamentos_staging`;
--> statement-breakpoint
DELETE FROM `centi_leituras`;
--> statement-breakpoint
DROP TABLE `centi_staging_fora`;
--> statement-breakpoint
ALTER TABLE `centi_lote_passos` ADD `chaves_iguais` text;
--> statement-breakpoint
ALTER TABLE `centi_lote_passos` ADD `chaves_fora` text;
--> statement-breakpoint
-- (2) REMOÇÃO CONFIRMADA: o registro que some numa importação fica AUSENTE (continua valendo); só some de novo na próxima
--     importação concluída é que a regra dos removidos vale.
ALTER TABLE `centi_lotes` ADD `ausentes` integer;
--> statement-breakpoint
ALTER TABLE `empenhos` ADD `ausente_desde_lote` integer;
--> statement-breakpoint
ALTER TABLE `liquidacoes` ADD `ausente_desde_lote` integer;
--> statement-breakpoint
ALTER TABLE `pagamentos` ADD `ausente_desde_lote` integer;
--> statement-breakpoint
-- (2b) A ASSINATURA dos dados de cada registro (o "hash" da leitura): a importação compara a assinatura — o registro igual
--      nunca é escrito; o navegador manda inteiro só o que mudou.
ALTER TABLE `empenhos` ADD `hash` text;
--> statement-breakpoint
ALTER TABLE `liquidacoes` ADD `hash` text;
--> statement-breakpoint
ALTER TABLE `pagamentos` ADD `hash` text;
--> statement-breakpoint
ALTER TABLE `empenhos_staging` ADD `hash` text;
--> statement-breakpoint
ALTER TABLE `liquidacoes_staging` ADD `hash` text;
--> statement-breakpoint
ALTER TABLE `pagamentos_staging` ADD `hash` text;
--> statement-breakpoint
-- (3) O HISTÓRICO DAS ALTERAÇÕES: o valor anterior de cada campo que a Centi mudou nunca se perde (sem FK: o histórico
--     fica mesmo que o registro saia; a limpeza do cron leva o que passou de 365 dias).
CREATE TABLE `centi_alteracoes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tipo` text NOT NULL,
  `registro_id` integer NOT NULL,
  `card_id` integer,
  `lote_id` integer,
  `acao` text NOT NULL,
  `campos` text,
  `em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `centi_alteracoes_registro_idx` ON `centi_alteracoes` (`tipo`, `registro_id`, `id`);
--> statement-breakpoint
CREATE INDEX `centi_alteracoes_em_idx` ON `centi_alteracoes` (`em`);
