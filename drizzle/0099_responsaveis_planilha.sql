-- RESPONSÁVEIS POR DFDs numa PLANILHA ÚNICA (v1.52.0): a PESSOA é cadastrada uma vez (nome + matrícula) e VINCULADA a
-- unidades e órgãos como padrão ou temporário — o vínculo guarda a função, a nomeação (ato) e o período. Converte os JSON
-- de `reparticoes.responsavel_dfd` e `orgaos.responsavel_dfd` (todos os formatos que o sistema já leu); as colunas
-- ficam DORMENTES (sem DROP). A mesma pessoa em vários lugares vira UMA linha (nome sem acento/caixa + matrícula).
CREATE TABLE IF NOT EXISTS `responsaveis` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `nome` text NOT NULL,
  `matricula` text DEFAULT '' NOT NULL,
  `chave` text NOT NULL,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP),
  `atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `responsaveis_chave_matricula_uq` ON `responsaveis` (`chave`, `matricula`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `responsaveis_vinculos` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `responsavel_id` integer NOT NULL REFERENCES `responsaveis`(`id`) ON DELETE cascade,
  `orgao_id` integer REFERENCES `orgaos`(`id`) ON DELETE cascade,
  `reparticao_id` integer REFERENCES `reparticoes`(`id`) ON DELETE cascade,
  `tipo` text NOT NULL,
  `funcao` text DEFAULT '' NOT NULL,
  `ato_tipo` text,
  `ato_numero` text DEFAULT '' NOT NULL,
  `ato_link` text DEFAULT '' NOT NULL,
  `inicio` text,
  `fim` text,
  `ordem` integer DEFAULT 0 NOT NULL,
  `criado_em` text DEFAULT (CURRENT_TIMESTAMP),
  CHECK ((`orgao_id` IS NULL) <> (`reparticao_id` IS NULL)),
  CHECK (`tipo` IN ('padrao', 'temporario')),
  CHECK (`tipo` = 'padrao' OR (`inicio` IS NOT NULL AND `fim` IS NOT NULL AND `inicio` <= `fim`))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `responsaveis_vinculos_orgao_idx` ON `responsaveis_vinculos` (`orgao_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `responsaveis_vinculos_reparticao_idx` ON `responsaveis_vinculos` (`reparticao_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `responsaveis_vinculos_responsavel_idx` ON `responsaveis_vinculos` (`responsavel_id`);
--> statement-breakpoint
DROP TABLE IF EXISTS `_resp_migra`;
--> statement-breakpoint
CREATE TABLE `_resp_migra` (
  `orgao_id` integer, `reparticao_id` integer, `tipo` text, `nome` text, `matricula` text, `funcao` text,
  `ato_tipo` text, `ato_numero` text, `ato_link` text, `inicio` text, `fim` text, `ordem` integer, `chave` text
);
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT NULL, f.id, 'padrao', trim(coalesce(json_extract(j.value, '$.nome'), '')), trim(coalesce(json_extract(j.value, '$.matricula'), '')), trim(coalesce(json_extract(j.value, '$.funcao'), '')),
  CASE WHEN json_extract(j.value, '$.nomeacao.tipo') IN ('portaria','decreto','lei') THEN json_extract(j.value, '$.nomeacao.tipo') END, trim(coalesce(json_extract(j.value, '$.nomeacao.numero'), '')), trim(coalesce(json_extract(j.value, '$.nomeacao.link'), '')), NULL, NULL, j.key
FROM reparticoes f, json_each(f.responsavel_dfd, '$.padroes') j
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd, '$.padroes') = 'array';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT NULL, f.id, 'temporario', trim(coalesce(json_extract(j.value, '$.nome'), '')), trim(coalesce(json_extract(j.value, '$.matricula'), '')), trim(coalesce(json_extract(j.value, '$.funcao'), '')),
  CASE WHEN json_extract(j.value, '$.nomeacao.tipo') IN ('portaria','decreto','lei') THEN json_extract(j.value, '$.nomeacao.tipo') END, trim(coalesce(coalesce(json_extract(j.value, '$.nomeacao.numero'), json_extract(j.value, '$.ato')), '')), trim(coalesce(json_extract(j.value, '$.nomeacao.link'), '')),
  trim(coalesce(json_extract(j.value, '$.inicio'), '')), trim(coalesce(json_extract(j.value, '$.fim'), '')), j.key
FROM reparticoes f, json_each(f.responsavel_dfd, '$.temporarios') j
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd) = 'object' AND json_type(f.responsavel_dfd, '$.temporarios') = 'array';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT NULL, f.id, 'padrao', trim(coalesce(json_extract(f.responsavel_dfd, '$.padrao'), '')), '', '', NULL, '', '', NULL, NULL, 0
FROM reparticoes f
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd) = 'object' AND json_type(f.responsavel_dfd, '$.padroes') IS NULL
  AND json_type(f.responsavel_dfd, '$.padrao') = 'text';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT NULL, f.id, 'padrao',
  (SELECT trim(j.value) FROM json_each(f.responsavel_dfd) j WHERE trim(coalesce(j.value, '')) <> '' ORDER BY j.key LIMIT 1),
  '', '', NULL, '', '', NULL, NULL, 0
FROM reparticoes f
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd) = 'array';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT NULL, f.id, 'padrao', trim(f.responsavel_dfd), '', '', NULL, '', '', NULL, NULL, 0
FROM reparticoes f
WHERE f.responsavel_dfd IS NOT NULL AND trim(f.responsavel_dfd) <> '' AND NOT json_valid(f.responsavel_dfd);
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT f.id, NULL, 'padrao', trim(coalesce(json_extract(j.value, '$.nome'), '')), trim(coalesce(json_extract(j.value, '$.matricula'), '')), trim(coalesce(json_extract(j.value, '$.funcao'), '')),
  CASE WHEN json_extract(j.value, '$.nomeacao.tipo') IN ('portaria','decreto','lei') THEN json_extract(j.value, '$.nomeacao.tipo') END, trim(coalesce(json_extract(j.value, '$.nomeacao.numero'), '')), trim(coalesce(json_extract(j.value, '$.nomeacao.link'), '')), NULL, NULL, j.key
FROM orgaos f, json_each(f.responsavel_dfd, '$.padroes') j
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd, '$.padroes') = 'array';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT f.id, NULL, 'temporario', trim(coalesce(json_extract(j.value, '$.nome'), '')), trim(coalesce(json_extract(j.value, '$.matricula'), '')), trim(coalesce(json_extract(j.value, '$.funcao'), '')),
  CASE WHEN json_extract(j.value, '$.nomeacao.tipo') IN ('portaria','decreto','lei') THEN json_extract(j.value, '$.nomeacao.tipo') END, trim(coalesce(coalesce(json_extract(j.value, '$.nomeacao.numero'), json_extract(j.value, '$.ato')), '')), trim(coalesce(json_extract(j.value, '$.nomeacao.link'), '')),
  trim(coalesce(json_extract(j.value, '$.inicio'), '')), trim(coalesce(json_extract(j.value, '$.fim'), '')), j.key
FROM orgaos f, json_each(f.responsavel_dfd, '$.temporarios') j
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd) = 'object' AND json_type(f.responsavel_dfd, '$.temporarios') = 'array';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT f.id, NULL, 'padrao', trim(coalesce(json_extract(f.responsavel_dfd, '$.padrao'), '')), '', '', NULL, '', '', NULL, NULL, 0
FROM orgaos f
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd) = 'object' AND json_type(f.responsavel_dfd, '$.padroes') IS NULL
  AND json_type(f.responsavel_dfd, '$.padrao') = 'text';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT f.id, NULL, 'padrao',
  (SELECT trim(j.value) FROM json_each(f.responsavel_dfd) j WHERE trim(coalesce(j.value, '')) <> '' ORDER BY j.key LIMIT 1),
  '', '', NULL, '', '', NULL, NULL, 0
FROM orgaos f
WHERE json_valid(f.responsavel_dfd) AND json_type(f.responsavel_dfd) = 'array';
--> statement-breakpoint
INSERT INTO _resp_migra (orgao_id, reparticao_id, tipo, nome, matricula, funcao, ato_tipo, ato_numero, ato_link, inicio, fim, ordem)
SELECT f.id, NULL, 'padrao', trim(f.responsavel_dfd), '', '', NULL, '', '', NULL, NULL, 0
FROM orgaos f
WHERE f.responsavel_dfd IS NOT NULL AND trim(f.responsavel_dfd) <> '' AND NOT json_valid(f.responsavel_dfd);
--> statement-breakpoint
DELETE FROM `_resp_migra` WHERE `nome` IS NULL OR `nome` = ''
  OR (`tipo` = 'temporario' AND (`inicio` = '' OR `fim` = '' OR `inicio` > `fim`));
--> statement-breakpoint
UPDATE `_resp_migra` SET `inicio` = NULL, `fim` = NULL WHERE `tipo` = 'padrao';
--> statement-breakpoint
UPDATE `_resp_migra` SET `chave` = upper(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`nome`, char(9), ' '), char(10), ' '), char(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), 'á', 'a'), 'à', 'a'), 'â', 'a'), 'ã', 'a'), 'ä', 'a'), 'é', 'e'), 'è', 'e'), 'ê', 'e'), 'ë', 'e'), 'í', 'i'), 'ì', 'i'), 'î', 'i'), 'ï', 'i'), 'ó', 'o'), 'ò', 'o'), 'ô', 'o'), 'õ', 'o'), 'ö', 'o'), 'ú', 'u'), 'ù', 'u'), 'û', 'u'), 'ü', 'u'), 'ç', 'c'), 'ñ', 'n'), 'Á', 'A'), 'À', 'A'), 'Â', 'A'), 'Ã', 'A'), 'Ä', 'A'), 'É', 'E'), 'È', 'E'), 'Ê', 'E'), 'Ë', 'E'), 'Í', 'I'), 'Ì', 'I'), 'Î', 'I'), 'Ï', 'I'), 'Ó', 'O'), 'Ò', 'O'), 'Ô', 'O'), 'Õ', 'O'), 'Ö', 'O'), 'Ú', 'U'), 'Ù', 'U'), 'Û', 'U'), 'Ü', 'U'), 'Ç', 'C'), 'Ñ', 'N')));
--> statement-breakpoint
UPDATE `_resp_migra` SET `matricula` = (SELECT MAX(s.`matricula`) FROM `_resp_migra` s WHERE s.`chave` = `_resp_migra`.`chave` AND s.`matricula` <> '')
WHERE `matricula` = '' AND (SELECT COUNT(DISTINCT s.`matricula`) FROM `_resp_migra` s WHERE s.`chave` = `_resp_migra`.`chave` AND s.`matricula` <> '') = 1;
--> statement-breakpoint
INSERT OR IGNORE INTO `responsaveis` (`nome`, `matricula`, `chave`)
SELECT `nome`, `matricula`, `chave` FROM `_resp_migra` ORDER BY `reparticao_id` IS NULL, `rowid`;
--> statement-breakpoint
INSERT INTO `responsaveis_vinculos` (`responsavel_id`, `orgao_id`, `reparticao_id`, `tipo`, `funcao`, `ato_tipo`, `ato_numero`, `ato_link`, `inicio`, `fim`, `ordem`)
SELECT p.`id`, s.`orgao_id`, s.`reparticao_id`, s.`tipo`, s.`funcao`, s.`ato_tipo`, s.`ato_numero`, s.`ato_link`, s.`inicio`, s.`fim`, s.`ordem`
FROM `_resp_migra` s JOIN `responsaveis` p ON p.`chave` = s.`chave` AND p.`matricula` = s.`matricula`
WHERE NOT EXISTS (
  SELECT 1 FROM `responsaveis_vinculos` v WHERE v.`responsavel_id` = p.`id` AND v.`tipo` = s.`tipo`
    AND v.`orgao_id` IS s.`orgao_id` AND v.`reparticao_id` IS s.`reparticao_id` AND v.`inicio` IS s.`inicio`
)
GROUP BY p.`id`, s.`orgao_id`, s.`reparticao_id`, s.`tipo`, s.`inicio`
HAVING s.`rowid` = MIN(s.`rowid`)
ORDER BY MIN(s.`rowid`);
--> statement-breakpoint
DROP TABLE `_resp_migra`;
