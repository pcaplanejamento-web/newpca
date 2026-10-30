-- FROTAS (cartão de combustível e de manutenção da VÓLUS): contratos, vínculos das unidades da Vólus ao cadastro,
-- classificações, o CADASTRO dos veículos (uma linha por placa), as TRANSAÇÕES (abastecimentos e manutenções, uma tabela —
-- `tipo`), o histórico das LEITURAS e o CURSOR da atualização automática. Aditiva.
CREATE TABLE `frota_contratos` (
	`codigo` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL DEFAULT '',
	`sigla` text NOT NULL DEFAULT '',
	`produto` text NOT NULL DEFAULT 'ambos' CHECK (`produto` IN ('combustivel', 'manutencao', 'ambos')),
	`orgao_id` integer REFERENCES `orgaos`(`id`) ON DELETE set null,
	`ativo` integer NOT NULL DEFAULT 1,
	`criado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
-- Os contratos da Prefeitura na Vólus (os 11 que a credencial alcança — o ADM liga cada um ao órgão do cadastro).
INSERT INTO `frota_contratos` (`codigo`, `nome`, `sigla`, `produto`) VALUES
	('000617000002', 'Prefeitura Municipal de Rio Verde', 'PMRV', 'combustivel'),
	('000617000003', 'Fundo Municipal de Assistência Social', 'FMAS', 'combustivel'),
	('000617000004', 'Fundo Municipal de Saúde', 'FMS', 'combustivel'),
	('000600000138', 'Município de Rio Verde', 'PMRV', 'manutencao'),
	('000600000140', 'Fundo Municipal de Educação', 'FME', 'manutencao'),
	('000600000141', 'Agência Municipal de Mobilidade e Trânsito', 'AMT', 'manutencao'),
	('000600000142', 'Fundo Municipal de Assistência Social', 'FMAS', 'manutencao'),
	('000600000143', 'Fundo Municipal de Proteção e Defesa do Consumidor', 'PROCON', 'manutencao'),
	('000600000144', 'Fundo Municipal de Saúde', 'FMS', 'manutencao'),
	('000600000235', 'Fundo Municipal de Desenvolvimento Econômico Sustentável', 'FMDES', 'manutencao'),
	('000600000224', 'Fundo Especial do Corpo de Bombeiros', 'FEMBOM', 'manutencao');
--> statement-breakpoint
-- O órgão de cada contrato: o de MESMA sigla no cadastro, quando é um só (o ADM confere e troca).
UPDATE `frota_contratos` SET `orgao_id` = (SELECT o.`id` FROM `orgaos` o WHERE upper(o.`sigla`) = `frota_contratos`.`sigla`)
WHERE (SELECT COUNT(*) FROM `orgaos` o WHERE upper(o.`sigla`) = `frota_contratos`.`sigla`) = 1;
--> statement-breakpoint
CREATE TABLE `frota_unidades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chave` text NOT NULL,
	`nome` text NOT NULL,
	`contrato` text,
	`reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE set null,
	`visto_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frota_unidades_chave_uq` ON `frota_unidades` (`chave`);
--> statement-breakpoint
CREATE TABLE `frota_classificacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor` text NOT NULL DEFAULT '#2563eb',
	`ordem` integer NOT NULL DEFAULT 0,
	`criado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frota_classificacoes_nome_uq` ON `frota_classificacoes` (lower(`nome`));
--> statement-breakpoint
CREATE TABLE `frota_veiculos` (
	`placa` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL DEFAULT 'veiculo' CHECK (`tipo` IN ('veiculo', 'maquina')),
	`classificacao_id` integer REFERENCES `frota_classificacoes`(`id`) ON DELETE set null,
	`marca` text,
	`modelo` text,
	`ano` integer,
	`situacao` text NOT NULL DEFAULT 'ativo' CHECK (`situacao` IN ('ativo', 'inativo')),
	`origem` text CHECK (`origem` IS NULL OR `origem` IN ('proprio', 'contrato')),
	`fipe` real,
	`locacao` real,
	`contrato` text,
	`capacidade_tanque` real,
	`reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE set null,
	`observacao` text,
	`criado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_por` text
);
--> statement-breakpoint
CREATE INDEX `frota_veiculos_classificacao_idx` ON `frota_veiculos` (`classificacao_id`);
--> statement-breakpoint
CREATE TABLE `frota_transacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL CHECK (`tipo` IN ('abastecimento', 'manutencao')),
	`chave` text NOT NULL,
	`contrato` text NOT NULL,
	`ref_id` text,
	`data_hora` text,
	`dia` text NOT NULL,
	`ano` integer NOT NULL,
	`placa` text,
	`placa_crua` text,
	`prefixo` text,
	`cartao` text,
	`marca` text,
	`modelo` text,
	`ano_fabricacao` integer,
	`motorista` text,
	`motorista_cnh` text,
	`motorista_cpf` text,
	`estabelecimento` text,
	`estab_cnpj` text,
	`estab_endereco` text,
	`estab_bairro` text,
	`estab_cidade` text,
	`estab_uf` text,
	`estab_cep` text,
	`latitude` real,
	`longitude` real,
	`produtos` text,
	`itens` text,
	`qtd_itens` integer NOT NULL DEFAULT 0,
	`litros` real,
	`preco_litro` real,
	`valor` real NOT NULL DEFAULT 0,
	`hodometro` real,
	`medidor_texto` text,
	`km_rodado` real,
	`consumo` real,
	`tipo_manutencao` text,
	`nota_fiscal` text,
	`nf_produtos` text,
	`nf_servicos` text,
	`valor_nota` real,
	`faturado` integer,
	`empenho` text,
	`processo` text,
	`unidade_nome` text,
	`unidade_codigo` text,
	`unidade_chave` text,
	`orgao_id` integer REFERENCES `orgaos`(`id`) ON DELETE set null,
	`reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE set null,
	`hash` text NOT NULL,
	`ausente` integer NOT NULL DEFAULT 0,
	`removido_em` text,
	`criado_em` text NOT NULL,
	`atualizado_em` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frota_transacoes_chave_uq` ON `frota_transacoes` (`tipo`, `chave`);
--> statement-breakpoint
CREATE INDEX `frota_transacoes_periodo_idx` ON `frota_transacoes` (`contrato`, `tipo`, `dia`);
--> statement-breakpoint
CREATE INDEX `frota_transacoes_ano_idx` ON `frota_transacoes` (`tipo`, `ano`, `removido_em`);
--> statement-breakpoint
CREATE INDEX `frota_transacoes_placa_idx` ON `frota_transacoes` (`placa`, `dia`);
--> statement-breakpoint
CREATE INDEX `frota_transacoes_atualizado_idx` ON `frota_transacoes` (`atualizado_em`);
--> statement-breakpoint
CREATE INDEX `frota_transacoes_unidade_idx` ON `frota_transacoes` (`unidade_chave`);
--> statement-breakpoint
CREATE TABLE `frota_leituras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contrato` text NOT NULL,
	`tipo` text NOT NULL,
	`inicio` text NOT NULL,
	`fim` text NOT NULL,
	`origem` text NOT NULL DEFAULT 'manual',
	`estado` text NOT NULL CHECK (`estado` IN ('ok', 'dividido', 'erro')),
	`registros` integer NOT NULL DEFAULT 0,
	`novos` integer NOT NULL DEFAULT 0,
	`alterados` integer NOT NULL DEFAULT 0,
	`iguais` integer NOT NULL DEFAULT 0,
	`ausentes` integer NOT NULL DEFAULT 0,
	`removidos` integer NOT NULL DEFAULT 0,
	`fora` integer NOT NULL DEFAULT 0,
	`valor` real NOT NULL DEFAULT 0,
	`bytes` integer NOT NULL DEFAULT 0,
	`ms` integer NOT NULL DEFAULT 0,
	`erro` text,
	`por` text,
	`em` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `frota_leituras_contrato_idx` ON `frota_leituras` (`contrato`, `tipo`, `id`);
--> statement-breakpoint
CREATE INDEX `frota_leituras_em_idx` ON `frota_leituras` (`em`);
--> statement-breakpoint
-- O CURSOR da atualização automática por contrato × tipo: o ciclo (os últimos dias), o próximo dia a ler, o passo (dias por
-- pedido — divide quando a resposta não cabe, cresce quando sobra), as falhas seguidas e a espera.
CREATE TABLE `frota_cursores` (
	`contrato` text NOT NULL REFERENCES `frota_contratos`(`codigo`) ON DELETE cascade,
	`tipo` text NOT NULL,
	`ciclo_inicio` text,
	`proximo` text,
	`passo_dias` integer NOT NULL DEFAULT 7,
	`falhas` integer NOT NULL DEFAULT 0,
	`espera_ate` text,
	`trava_ate` text,
	`ciclo_iniciado_em` text,
	`ciclo_concluido_em` text,
	`ultimo_erro` text,
	PRIMARY KEY (`contrato`, `tipo`)
);
--> statement-breakpoint
CREATE TABLE `frota_estado` (
	`id` integer PRIMARY KEY NOT NULL,
	`versao` integer NOT NULL DEFAULT 0,
	`em` text
);
--> statement-breakpoint
INSERT INTO `frota_estado` (`id`, `versao`) VALUES (1, 0);
--> statement-breakpoint
-- As TELAS novas (Frotas · Combustível · Manutenção · Veículos): o Administrador e o Gestor ganham tudo nelas; o Membro,
-- consultar e exportar (como nas demais telas); os papéis criados pelo ADM, nada — o ADM libera.
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`,
	'$.frotas', json('["visualizar","exportar","configurar"]'),
	'$.combustivel', json('["visualizar","exportar","configurar"]'),
	'$.manutencao', json('["visualizar","exportar","configurar"]'),
	'$.veiculos', json('["visualizar","manipular","importar","exportar","configurar"]'))
WHERE `chave` IN ('admin', 'gestor') AND json_valid(`capacidades`);
--> statement-breakpoint
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`,
	'$.frotas', json('["visualizar","exportar"]'),
	'$.combustivel', json('["visualizar","exportar"]'),
	'$.manutencao', json('["visualizar","exportar"]'),
	'$.veiculos', json('["visualizar","exportar"]'))
WHERE `chave` = 'membro' AND json_valid(`capacidades`);
--> statement-breakpoint
-- … e os MÓDULOS do ADM ganham o módulo "Frotas" com as quatro telas (quando o ADM já tem módulos gravados).
UPDATE `configuracoes` SET `dados` = json_insert(`dados`, '$.modulos[#]', json('{"id":"frotas","nome":"Frotas","telas":["frotas","combustivel","manutencao","veiculos"]}'))
WHERE json_valid(`dados`) AND json_type(`dados`, '$.modulos') = 'array'
	AND NOT EXISTS (SELECT 1 FROM json_each(`dados`, '$.modulos') m WHERE json_extract(m.value, '$.id') = 'frotas');
