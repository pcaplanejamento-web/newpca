-- EMPENHOS EM CARDS (v1.205.0). Tudo da execução da despesa numa tela só (Empenhos), no padrão do Orçamento: cada CARD é
-- uma importação da Centi com a PRÓPRIA integração (endereço e parâmetros), os anos, a programação da atualização
-- automática, as regras da conferência e os VÍNCULOS — quais órgãos gestores, unidades orçamentárias e ações entram e a
-- que unidade (ou órgão) do cadastro cada um pertence. Só o que um vínculo do card cobre é gravado. Os empenhos de cada
-- card ficam na MESMA tabela (`empenhos.card_id`); excluir o card exclui os dados dele.
-- O que existia vai para o 1º card ("Empenhos"): a configuração da API, os vínculos escolhidos em Órgãos e Unidades, as
-- importações e os empenhos. Depois sai o que não faz mais parte da lógica: o cadastro das APIs (Integrações), o vínculo
-- no cadastro de Órgãos e Unidades (colunas, gatilhos e a VIEW) e as tabelas antigas das unidades/ações da Centi.
CREATE TABLE `empenho_cards` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `nome` text NOT NULL,
  `descricao` text DEFAULT '' NOT NULL,
  `cor` text DEFAULT '#2563eb' NOT NULL,
  `url_base` text DEFAULT 'https://api.centi.com.br/portal' NOT NULL,
  `endpoint` text DEFAULT 'getempenhos' NOT NULL,
  `uf` text DEFAULT 'go' NOT NULL,
  `tenant` text DEFAULT 'rioverde' NOT NULL,
  `parametros` text DEFAULT '{"dataInicio":"{inicio}","dataFim":"{fim}"}' NOT NULL,
  `anos` text DEFAULT '[0]' NOT NULL,
  `ativa` integer DEFAULT 0 NOT NULL,
  `frequencia_min` integer DEFAULT 120 NOT NULL,
  `dias_uteis` integer DEFAULT 1 NOT NULL,
  `hora_inicio` text DEFAULT '07:00' NOT NULL,
  `hora_fim` text DEFAULT '19:00' NOT NULL,
  `queda_soma` integer DEFAULT 80 NOT NULL,
  `queda_registros` integer DEFAULT 90 NOT NULL,
  `removidos` text DEFAULT 'marcar' NOT NULL,
  `ultima_execucao` text,
  `ultimo_status` text,
  `ultima_contagem` integer,
  `ultimo_total` integer,
  `vinculos_em` text,
  `criado_por` text DEFAULT '' NOT NULL,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `atualizado_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
-- Os VÍNCULOS de cada card: o órgão gestor da Centi, a unidade orçamentária (NULL = todas) e a ação (NULL = todas) → o
-- órgão e, opcional, a unidade do cadastro. O mais específico vale (a ação › a unidade orçamentária › o órgão gestor).
CREATE TABLE `empenho_card_vinculos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `card_id` integer NOT NULL REFERENCES `empenho_cards`(`id`) ON DELETE CASCADE,
  `orgao_gestor` text NOT NULL,
  `unidade` text,
  `acao` text,
  `orgao_id` integer NOT NULL REFERENCES `orgaos`(`id`) ON DELETE CASCADE,
  `reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `empenho_card_vinculos_uq` ON `empenho_card_vinculos` (`card_id`, `orgao_gestor`, IFNULL(`unidade`, '*'), IFNULL(`acao`, '*'));
--> statement-breakpoint
CREATE INDEX `empenho_card_vinculos_reparticao_idx` ON `empenho_card_vinculos` (`reparticao_id`);
--> statement-breakpoint
-- O CATÁLOGO da Centi (global — todos os cards o usam para escolher): cada órgão gestor + unidade orçamentária + ação que
-- as leituras trouxeram, com quantos registros a última leitura viu.
CREATE TABLE `centi_catalogo` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `orgao_gestor` text NOT NULL,
  `unidade` text DEFAULT '' NOT NULL,
  `acao` text DEFAULT '' NOT NULL,
  `registros` integer DEFAULT 0 NOT NULL,
  `ultimo_lote` integer,
  `ultimo_ano` integer,
  `visto_em` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `centi_catalogo_uq` ON `centi_catalogo` (`orgao_gestor`, `unidade`, `acao`);
--> statement-breakpoint
-- O 1º card = a API de empenhos que existia (os anos mantidos viram a lista relativa: 0 = o atual, -1 = o anterior…).
INSERT INTO `empenho_cards` (`id`, `nome`, `descricao`, `url_base`, `endpoint`, `uf`, `tenant`, `parametros`, `anos`, `ativa`, `frequencia_min`, `dias_uteis`, `hora_inicio`, `hora_fim`, `ultima_execucao`, `ultimo_status`, `ultima_contagem`, `ultimo_total`, `vinculos_em`, `criado_por`)
SELECT 1, 'Empenhos', `descricao`, `url_base`, `endpoint`, `uf`, `tenant`, `parametros`,
  CASE `anos` WHEN 1 THEN '[0]' WHEN 3 THEN '[0,-1,-2]' ELSE '[0,-1]' END,
  `ativa`, `frequencia_min`, `dias_uteis`, `hora_inicio`, `hora_fim`, `ultima_execucao`, `ultimo_status`, `ultima_contagem`, `ultimo_total`,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Migração'
FROM `centi_apis` WHERE `chave` = 'empenhos';
--> statement-breakpoint
-- Os vínculos de Órgãos e Unidades → os do 1º card: o órgão gestor do órgão (inteiro) …
INSERT OR IGNORE INTO `empenho_card_vinculos` (`card_id`, `orgao_gestor`, `unidade`, `acao`, `orgao_id`, `reparticao_id`)
SELECT c.`id`, o.`centi_orgao_gestor`, NULL, NULL, o.`id`, NULL FROM `orgaos` o JOIN `empenho_cards` c ON c.`id` = 1 WHERE o.`centi_orgao_gestor` IS NOT NULL;
--> statement-breakpoint
-- … a unidade orçamentária dividida por ações (uma linha por ação da unidade) …
INSERT OR IGNORE INTO `empenho_card_vinculos` (`card_id`, `orgao_gestor`, `unidade`, `acao`, `orgao_id`, `reparticao_id`)
SELECT c.`id`, cu.`orgao_gestor`, cu.`unidade`, ca.`acao`, r.`orgao_id`, r.`id`
FROM `reparticoes` r JOIN `centi_unidades` cu ON cu.`id` = r.`centi_unidade_id` JOIN `centi_acoes` ca ON ca.`reparticao_id` = r.`id` AND ca.`centi_unidade_id` = cu.`id` JOIN `empenho_cards` c ON c.`id` = 1
WHERE r.`orgao_id` IS NOT NULL;
--> statement-breakpoint
-- … e a unidade orçamentária inteira (a unidade sem ações dela).
INSERT OR IGNORE INTO `empenho_card_vinculos` (`card_id`, `orgao_gestor`, `unidade`, `acao`, `orgao_id`, `reparticao_id`)
SELECT c.`id`, cu.`orgao_gestor`, cu.`unidade`, NULL, r.`orgao_id`, r.`id`
FROM `reparticoes` r JOIN `centi_unidades` cu ON cu.`id` = r.`centi_unidade_id` JOIN `empenho_cards` c ON c.`id` = 1
WHERE r.`orgao_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `centi_acoes` a WHERE a.`reparticao_id` = r.`id` AND a.`centi_unidade_id` = r.`centi_unidade_id`);
--> statement-breakpoint
-- O catálogo das ações já lidas.
INSERT OR IGNORE INTO `centi_catalogo` (`orgao_gestor`, `unidade`, `acao`, `registros`, `ultimo_lote`, `ultimo_ano`, `visto_em`)
SELECT cu.`orgao_gestor`, cu.`unidade`, ca.`acao`, ca.`registros`, ca.`ultimo_lote`, ca.`ultimo_ano`, ca.`visto_em` FROM `centi_acoes` ca JOIN `centi_unidades` cu ON cu.`id` = ca.`centi_unidade_id`;
--> statement-breakpoint
-- As IMPORTAÇÕES passam a ser de um card (a coluna da API sai).
ALTER TABLE `centi_lotes` ADD `card_id` integer REFERENCES `empenho_cards`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE `centi_lotes` SET `card_id` = (SELECT `id` FROM `empenho_cards` WHERE `id` = 1) WHERE `api_chave` = 'empenhos';
--> statement-breakpoint
DELETE FROM `centi_lotes` WHERE `card_id` IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `centi_lotes_api_ano_idx`;
--> statement-breakpoint
ALTER TABLE `centi_lotes` DROP COLUMN `api_chave`;
--> statement-breakpoint
CREATE INDEX `centi_lotes_card_ano_idx` ON `centi_lotes` (`card_id`, `ano`, `id`);
--> statement-breakpoint
-- Os EMPENHOS passam a ser de um card: a chave é única POR CARD (o mesmo empenho pode estar em dois cards).
ALTER TABLE `empenhos` ADD `card_id` integer REFERENCES `empenho_cards`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
UPDATE `empenhos` SET `card_id` = (SELECT `id` FROM `empenho_cards` WHERE `id` = 1);
--> statement-breakpoint
-- O vínculo de cada empenho pela régua nova (a mesma de antes, agora nos vínculos do card); sem vínculo, sai.
UPDATE `empenhos` SET
  `orgao_id` = (SELECT v.`orgao_id` FROM `empenho_card_vinculos` v WHERE v.`card_id` = `empenhos`.`card_id` AND v.`orgao_gestor` = `empenhos`.`orgao_gestor` AND (v.`unidade` IS NULL OR v.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')) AND (v.`acao` IS NULL OR v.`acao` = IFNULL(`empenhos`.`acao`, '')) ORDER BY v.`acao` IS NULL, v.`unidade` IS NULL LIMIT 1),
  `reparticao_id` = (SELECT v.`reparticao_id` FROM `empenho_card_vinculos` v WHERE v.`card_id` = `empenhos`.`card_id` AND v.`orgao_gestor` = `empenhos`.`orgao_gestor` AND (v.`unidade` IS NULL OR v.`unidade` = IFNULL(`empenhos`.`unidade_orcamentaria`, '')) AND (v.`acao` IS NULL OR v.`acao` = IFNULL(`empenhos`.`acao`, '')) ORDER BY v.`acao` IS NULL, v.`unidade` IS NULL LIMIT 1);
--> statement-breakpoint
DELETE FROM `empenhos` WHERE `card_id` IS NULL OR `orgao_id` IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `empenhos_chave_uq`;
--> statement-breakpoint
DROP INDEX IF EXISTS `empenhos_ano_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `empenhos_card_chave_uq` ON `empenhos` (`card_id`, `chave`);
--> statement-breakpoint
CREATE INDEX `empenhos_card_ano_idx` ON `empenhos` (`card_id`, `ano`, `removido_em`);
--> statement-breakpoint
-- O que sai da lógica: a VIEW e os gatilhos do vínculo no cadastro, as colunas da Centi em Órgãos e Unidades, as tabelas
-- antigas das unidades/ações da Centi e o cadastro das APIs (Integrações).
DROP VIEW IF EXISTS `centi_vinculo_empenhos`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_reparticao_nova`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_reparticao_editada`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_reparticao_excluida`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_orgao_novo`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_orgao_editado`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `centi_vinculo_orgao_excluido`;
--> statement-breakpoint
DROP INDEX IF EXISTS `reparticoes_centi_unidade_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `reparticoes_centi_unidade_uq`;
--> statement-breakpoint
DROP INDEX IF EXISTS `orgaos_centi_gestor_uq`;
--> statement-breakpoint
ALTER TABLE `reparticoes` DROP COLUMN `centi_unidade_id`;
--> statement-breakpoint
ALTER TABLE `orgaos` DROP COLUMN `centi_orgao_gestor`;
--> statement-breakpoint
DROP TABLE IF EXISTS `centi_acoes`;
--> statement-breakpoint
DROP TABLE IF EXISTS `centi_unidades`;
--> statement-breakpoint
DROP TABLE IF EXISTS `centi_apis`;
--> statement-breakpoint
-- O CADASTRO que muda acompanha os empenhos (sem chave estrangeira em `empenhos`): a unidade ou o órgão que sai leva os
-- empenhos vinculados a ele (os vínculos dele saem pela cascata); a unidade que muda de órgão leva o vínculo e os
-- empenhos. A data dos vínculos do card muda junto (a tela relê).
CREATE TRIGGER `empenho_vinculo_reparticao_excluida` BEFORE DELETE ON `reparticoes` BEGIN
  UPDATE `empenho_cards` SET `vinculos_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` IN (SELECT `card_id` FROM `empenho_card_vinculos` WHERE `reparticao_id` = OLD.`id`);
  DELETE FROM `empenhos` WHERE `reparticao_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `empenho_vinculo_orgao_excluido` BEFORE DELETE ON `orgaos` BEGIN
  UPDATE `empenho_cards` SET `vinculos_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` IN (SELECT `card_id` FROM `empenho_card_vinculos` WHERE `orgao_id` = OLD.`id`);
  DELETE FROM `empenhos` WHERE `orgao_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `empenho_vinculo_reparticao_orgao` AFTER UPDATE OF `orgao_id` ON `reparticoes` WHEN OLD.`orgao_id` IS NOT NEW.`orgao_id` AND NEW.`orgao_id` IS NOT NULL BEGIN
  UPDATE `empenho_card_vinculos` SET `orgao_id` = NEW.`orgao_id` WHERE `reparticao_id` = NEW.`id`;
  UPDATE `empenhos` SET `orgao_id` = NEW.`orgao_id` WHERE `reparticao_id` = NEW.`id`;
  UPDATE `empenho_cards` SET `vinculos_em` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE `id` IN (SELECT `card_id` FROM `empenho_card_vinculos` WHERE `reparticao_id` = NEW.`id`);
END;
--> statement-breakpoint
-- A tela Empenhos ganha Importar, Excluir e Configurar (os cards): o Administrador e o Gestor (tudo) as recebem; os demais
-- papéis ficam como estão (o ADM as dá em Configurações → Papéis).
UPDATE `papeis` SET `capacidades` = json_set(`capacidades`, '$.empenhos', json('["visualizar","importar","exportar","excluir","configurar"]'))
WHERE `chave` IN ('admin', 'gestor') AND json_valid(`capacidades`);
