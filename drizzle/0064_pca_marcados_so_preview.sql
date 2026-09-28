-- A visão dos MARCADOS (a PRÉVIA do PCA) só vale em PREVIEW: desliga-a nos PCAs já PUBLICADOS (a regra passou a ser
-- aplicada ao ligar e ao publicar — `PATCH /api/pca/[id]`). Idempotente.
UPDATE `pcas` SET `mesa_marcados` = 0 WHERE `status` = 'publicado' AND `mesa_marcados` = 1;
