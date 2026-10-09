-- RESPONSÁVEIS: o CARGO/FUNÇÃO é da PESSOA (o padrão segue o cargo dela; o temporário tem o cargo próprio) e a pessoa
-- pode ser LIGADA a um usuário da plataforma (ganha a foto). Aditiva e idempotente; o CHECK da 0099 já permite o período
-- no padrão (a regra "início ≤ fim" do padrão fica na aplicação).
ALTER TABLE `responsaveis` ADD `cargo` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `responsaveis` ADD `usuario_id` integer REFERENCES `usuarios`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `responsaveis_usuario_uq` ON `responsaveis` (`usuario_id`) WHERE `usuario_id` IS NOT NULL;
--> statement-breakpoint
-- 1) As funções digitadas viram CARGOS cadastrados (o índice sem caixa não deixa repetir; no fim da ordem).
INSERT OR IGNORE INTO `cargos` (`nome`, `ordem`)
SELECT f, (SELECT COALESCE(MAX(`ordem`), -1) FROM `cargos`) + ROW_NUMBER() OVER (ORDER BY lower(f))
FROM (SELECT trim(`funcao`) AS f FROM `responsaveis_vinculos` WHERE trim(`funcao`) <> '' GROUP BY lower(trim(`funcao`)));
--> statement-breakpoint
-- 2) O cargo da PESSOA = a função mais usada nos vínculos PADRÃO dela, com a grafia do cadastro (a do temporário é do
-- período, não da pessoa).
UPDATE `responsaveis` SET `cargo` = COALESCE((
  SELECT c.`nome` FROM `responsaveis_vinculos` v JOIN `cargos` c ON lower(c.`nome`) = lower(trim(v.`funcao`))
  WHERE v.`responsavel_id` = `responsaveis`.`id` AND v.`tipo` = 'padrao' AND trim(v.`funcao`) <> ''
  GROUP BY c.`id` ORDER BY COUNT(*) DESC, MIN(v.`id`) LIMIT 1
), '') WHERE `cargo` = '';
--> statement-breakpoint
-- 3) O temporário fica com a grafia do cadastro; o padrão não guarda função (segue a da pessoa).
UPDATE `responsaveis_vinculos` SET `funcao` = COALESCE((SELECT c.`nome` FROM `cargos` c WHERE lower(c.`nome`) = lower(trim(`responsaveis_vinculos`.`funcao`))), trim(`funcao`))
WHERE `tipo` = 'temporario';
--> statement-breakpoint
UPDATE `responsaveis_vinculos` SET `funcao` = '' WHERE `tipo` = 'padrao';
--> statement-breakpoint
-- 4) Liga ao USUÁRIO de MESMA matrícula (sem zeros à esquerda) — só quando a matrícula aponta UM usuário e UMA pessoa.
UPDATE `responsaveis` SET `usuario_id` = (
  SELECT u.`id` FROM `usuarios` u WHERE ltrim(trim(u.`matricula`), '0') = ltrim(trim(`responsaveis`.`matricula`), '0')
)
WHERE `usuario_id` IS NULL AND ltrim(trim(`matricula`), '0') <> ''
  AND (SELECT COUNT(*) FROM `usuarios` u WHERE ltrim(trim(u.`matricula`), '0') = ltrim(trim(`responsaveis`.`matricula`), '0')) = 1
  AND (SELECT COUNT(*) FROM `responsaveis` r WHERE ltrim(trim(r.`matricula`), '0') = ltrim(trim(`responsaveis`.`matricula`), '0')) = 1;
