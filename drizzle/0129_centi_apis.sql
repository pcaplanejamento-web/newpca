-- APIS DA CENTI (Integrações → aba "APIs da Centi") — SÓ O CADASTRO (aditiva). Nada é buscado: todas nascem
-- DESLIGADAS e "em preparação" (`implementada` = 0); a importação de cada uma chega em versões próprias.
-- Os órgãos (`lista`) são os ids do portal de transparência (idOrgao) — a lista CERTA (o Dattago percorria 2..20 e
-- deixava de fora 21, 22, 23, 24, 25 e 28). Os contratos são lidos por FONTE.
CREATE TABLE `centi_apis` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `chave` text NOT NULL,
  `nome` text NOT NULL,
  `descricao` text DEFAULT '' NOT NULL,
  `url_base` text DEFAULT 'https://api.centi.com.br/portal' NOT NULL,
  `endpoint` text NOT NULL,
  `uf` text DEFAULT 'go' NOT NULL,
  `tenant` text DEFAULT 'rioverde' NOT NULL,
  `divisao` text DEFAULT 'ano' NOT NULL,
  `paginado` integer DEFAULT 0 NOT NULL,
  `parametros` text DEFAULT '{}' NOT NULL,
  `lista` text DEFAULT '[]' NOT NULL,
  `ativa` integer DEFAULT 0 NOT NULL,
  `implementada` integer DEFAULT 0 NOT NULL,
  `frequencia_min` integer DEFAULT 120 NOT NULL,
  `dias_uteis` integer DEFAULT 1 NOT NULL,
  `hora_inicio` text DEFAULT '07:00' NOT NULL,
  `hora_fim` text DEFAULT '19:00' NOT NULL,
  `anos` integer DEFAULT 2 NOT NULL,
  `ordem` integer DEFAULT 0 NOT NULL,
  `ultima_execucao` text,
  `ultimo_status` text,
  `ultima_contagem` integer,
  `ultimo_total` integer,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP),
  `atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
CREATE UNIQUE INDEX `centi_apis_chave_uq` ON `centi_apis` (`chave`);
INSERT INTO `centi_apis` (`chave`, `nome`, `descricao`, `endpoint`, `divisao`, `paginado`, `parametros`, `lista`, `ordem`) VALUES
  ('empenhos', 'Empenhos', 'Notas de empenho do ano: órgão, unidade orçamentária, credor, classificação e valores empenhado, anulado, liquidado e pago.', 'getempenhos', 'ano', 1, '{"dataInicio":"01/01/{ano}","dataFim":"31/12/{ano}"}', '[]', 1),
  ('liquidacoes', 'Liquidações', 'Liquidações do ano por órgão, com o empenho de origem.', 'getliquidacoes', 'orgao', 0, '{"dataInicio":"01/01/{ano}","dataFim":"31/12/{ano}","idOrgao":"{orgao}"}', '[2,3,4,5,6,7,8,9,10,11,15,16,18,21,22,23,24,25,28]', 2),
  ('pagamentos', 'Pagamentos', 'Ordens de pagamento do ano por órgão, com retenções e anulações.', 'GetOrdempaPamento', 'orgao', 1, '{"ano":"{ano}","idOrgao":"{orgao}"}', '[2,3,4,5,6,7,8,9,10,11,15,16,18,21,22,23,24,25,28]', 3),
  ('contratos', 'Contratos', 'Parcelas de contratos por fonte de recurso (empenho, liquidação e pagamento).', 'ListaCredores', 'fonte', 0, '{"fonte":["{fonte}"],"ano":"{ano}"}', '[100,101,102,107,109,115,116,117,118,119,120,121,122,123,124,125,126,127,129,131,132,133,137,144,150,151,152,170,171,174,178,181,187,192,193,200,201,202,207,209,210,215,217,218,220,222,223,224,225,226,229,231,232,233,237,244,250,251,271,274,278,281,287,290,292,293]', 4),
  ('receita', 'Receita', 'Receita orçamentária detalhada do ano por órgão.', 'ObterReceitaOrcamentariaDetalhada', 'orgao', 0, '{"orgao":"{orgao}","ano":"{ano}"}', '[2,3,4,5,6,7,8,9,10,11,15,16,18,21,22,23,24,25,28]', 5);
