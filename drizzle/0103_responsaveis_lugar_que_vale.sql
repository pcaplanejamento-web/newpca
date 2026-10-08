-- RESPONSÁVEIS: o vínculo mora SEMPRE no lugar que vale pela regra de assinatura do órgão (v1.72.0). Só DADOS,
-- idempotente: a unidade de órgão com assinatura única leva os vínculos dela ao ÓRGÃO; o órgão "por unidade" que também é
-- unidade leva os dele à UNIDADE PRÓPRIA. O IGUAL que já existe no destino (mesma pessoa, tipo e período) sai; o que se
-- CRUZA com outro período da mesma pessoa no destino fica onde está (a Conferência aponta para revisar à mão).

-- 1a) Unidade de órgão com assinatura única: o igual que já está no órgão sai.
DELETE FROM `responsaveis_vinculos`
WHERE `reparticao_id` IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM `reparticoes` r JOIN `orgaos` o ON o.`id` = r.`orgao_id`
    WHERE r.`id` = `responsaveis_vinculos`.`reparticao_id` AND o.`assinatura_unica` = 1
  )
  AND EXISTS (
    SELECT 1 FROM `responsaveis_vinculos` x JOIN `reparticoes` r ON r.`id` = `responsaveis_vinculos`.`reparticao_id`
    WHERE x.`orgao_id` = r.`orgao_id`
      AND x.`responsavel_id` = `responsaveis_vinculos`.`responsavel_id` AND x.`tipo` = `responsaveis_vinculos`.`tipo`
      AND IFNULL(x.`inicio`, '') = IFNULL(`responsaveis_vinculos`.`inicio`, '')
      AND IFNULL(x.`fim`, '') = IFNULL(`responsaveis_vinculos`.`fim`, '')
  );

-- 1b) O mesmo vínculo repetido em várias unidades do órgão: fica o 1º (menor id).
DELETE FROM `responsaveis_vinculos`
WHERE `reparticao_id` IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM `reparticoes` r JOIN `orgaos` o ON o.`id` = r.`orgao_id`
    WHERE r.`id` = `responsaveis_vinculos`.`reparticao_id` AND o.`assinatura_unica` = 1
  )
  AND EXISTS (
    SELECT 1 FROM `responsaveis_vinculos` x
      JOIN `reparticoes` rx ON rx.`id` = x.`reparticao_id`
      JOIN `reparticoes` r ON r.`id` = `responsaveis_vinculos`.`reparticao_id`
    WHERE rx.`orgao_id` = r.`orgao_id` AND x.`id` < `responsaveis_vinculos`.`id`
      AND x.`responsavel_id` = `responsaveis_vinculos`.`responsavel_id` AND x.`tipo` = `responsaveis_vinculos`.`tipo`
      AND IFNULL(x.`inicio`, '') = IFNULL(`responsaveis_vinculos`.`inicio`, '')
      AND IFNULL(x.`fim`, '') = IFNULL(`responsaveis_vinculos`.`fim`, '')
  );

-- 1c) Os demais vão ao órgão — menos o que cruza com um período da mesma pessoa no órgão ou num irmão anterior.
UPDATE `responsaveis_vinculos`
SET `orgao_id` = (SELECT r.`orgao_id` FROM `reparticoes` r WHERE r.`id` = `responsaveis_vinculos`.`reparticao_id`),
    `reparticao_id` = NULL
WHERE `reparticao_id` IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM `reparticoes` r JOIN `orgaos` o ON o.`id` = r.`orgao_id`
    WHERE r.`id` = `responsaveis_vinculos`.`reparticao_id` AND o.`assinatura_unica` = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM `responsaveis_vinculos` x JOIN `reparticoes` r ON r.`id` = `responsaveis_vinculos`.`reparticao_id`
    WHERE x.`orgao_id` = r.`orgao_id`
      AND x.`responsavel_id` = `responsaveis_vinculos`.`responsavel_id` AND x.`tipo` = `responsaveis_vinculos`.`tipo`
      AND IFNULL(x.`inicio`, '') <= IFNULL(`responsaveis_vinculos`.`fim`, '9999-12-31')
      AND IFNULL(`responsaveis_vinculos`.`inicio`, '') <= IFNULL(x.`fim`, '9999-12-31')
  )
  AND NOT EXISTS (
    SELECT 1 FROM `responsaveis_vinculos` x
      JOIN `reparticoes` rx ON rx.`id` = x.`reparticao_id`
      JOIN `reparticoes` r ON r.`id` = `responsaveis_vinculos`.`reparticao_id`
    WHERE rx.`orgao_id` = r.`orgao_id` AND x.`id` < `responsaveis_vinculos`.`id`
      AND x.`responsavel_id` = `responsaveis_vinculos`.`responsavel_id` AND x.`tipo` = `responsaveis_vinculos`.`tipo`
      AND IFNULL(x.`inicio`, '') <= IFNULL(`responsaveis_vinculos`.`fim`, '9999-12-31')
      AND IFNULL(`responsaveis_vinculos`.`inicio`, '') <= IFNULL(x.`fim`, '9999-12-31')
  );

-- 2a) Órgão "por unidade" que também é unidade: o igual que já está na unidade própria sai.
DELETE FROM `responsaveis_vinculos`
WHERE `orgao_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `orgaos` o WHERE o.`id` = `responsaveis_vinculos`.`orgao_id` AND o.`assinatura_unica` = 0)
  AND EXISTS (
    SELECT 1 FROM `responsaveis_vinculos` x JOIN `reparticoes` p ON p.`id` = x.`reparticao_id`
    WHERE p.`orgao_id` = `responsaveis_vinculos`.`orgao_id` AND p.`orgao_proprio` = 1
      AND x.`responsavel_id` = `responsaveis_vinculos`.`responsavel_id` AND x.`tipo` = `responsaveis_vinculos`.`tipo`
      AND IFNULL(x.`inicio`, '') = IFNULL(`responsaveis_vinculos`.`inicio`, '')
      AND IFNULL(x.`fim`, '') = IFNULL(`responsaveis_vinculos`.`fim`, '')
  );

-- 2b) Os demais vão à unidade própria — menos o que cruza com um período da mesma pessoa lá.
UPDATE `responsaveis_vinculos`
SET `reparticao_id` = (
      SELECT p.`id` FROM `reparticoes` p WHERE p.`orgao_id` = `responsaveis_vinculos`.`orgao_id` AND p.`orgao_proprio` = 1 ORDER BY p.`id` LIMIT 1
    ),
    `orgao_id` = NULL
WHERE `orgao_id` IS NOT NULL
  AND EXISTS (SELECT 1 FROM `orgaos` o WHERE o.`id` = `responsaveis_vinculos`.`orgao_id` AND o.`assinatura_unica` = 0)
  AND EXISTS (SELECT 1 FROM `reparticoes` p WHERE p.`orgao_id` = `responsaveis_vinculos`.`orgao_id` AND p.`orgao_proprio` = 1)
  AND NOT EXISTS (
    SELECT 1 FROM `responsaveis_vinculos` x JOIN `reparticoes` p ON p.`id` = x.`reparticao_id`
    WHERE p.`orgao_id` = `responsaveis_vinculos`.`orgao_id` AND p.`orgao_proprio` = 1
      AND x.`responsavel_id` = `responsaveis_vinculos`.`responsavel_id` AND x.`tipo` = `responsaveis_vinculos`.`tipo`
      AND IFNULL(x.`inicio`, '') <= IFNULL(`responsaveis_vinculos`.`fim`, '9999-12-31')
      AND IFNULL(`responsaveis_vinculos`.`inicio`, '') <= IFNULL(x.`fim`, '9999-12-31')
  );
