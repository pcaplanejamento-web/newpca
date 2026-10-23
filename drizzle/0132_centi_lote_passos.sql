-- EXECUÇÃO DA DESPESA — a importação ACOMPANHADA (aditiva). Cada pedido feito à Centi (página de um período) vira um
-- PASSO do lote, com o resultado ou o erro em detalhe: a tela mostra ao vivo e o histórico guarda. A conferência passa
-- a somar o total informado por PERÍODO (o ano é lido mês a mês; o mês grande demais é dividido).
CREATE TABLE `centi_lote_passos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `lote_id` integer NOT NULL REFERENCES `centi_lotes`(`id`) ON DELETE cascade,
  `inicio` text NOT NULL,
  `fim` text NOT NULL,
  `pagina` integer NOT NULL,
  `estado` text NOT NULL,
  `fim_periodo` integer DEFAULT 0 NOT NULL,
  `status` integer,
  `bytes` integer,
  `ms` integer,
  `recebidos` integer DEFAULT 0 NOT NULL,
  `novos` integer DEFAULT 0 NOT NULL,
  `recusados` integer DEFAULT 0 NOT NULL,
  `repetidos` integer DEFAULT 0 NOT NULL,
  `total` integer,
  `mensagem` text,
  `corpo` text,
  `em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
CREATE INDEX `centi_lote_passos_lote_idx` ON `centi_lote_passos` (`lote_id`, `id`);
-- Os parâmetros com o ano inteiro passam a usar o PERÍODO ({inicio}/{fim} = o ano inteiro quando nada o divide).
UPDATE `centi_apis` SET `parametros` = replace(replace(`parametros`, '01/01/{ano}', '{inicio}'), '31/12/{ano}', '{fim}')
WHERE `parametros` LIKE '%01/01/{ano}%' AND `parametros` LIKE '%31/12/{ano}%';
