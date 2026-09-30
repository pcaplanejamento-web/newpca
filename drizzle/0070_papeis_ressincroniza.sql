-- RESSINCRONIZA o papel pelo `role` (idempotente): na janela do deploy da 0069 o código anterior ainda trocava só o
-- `role` — quem mudou de papel nesses minutos fica com o papel do sistema certo. Só mexe em quem está SEM papel ou com um
-- papel do SISTEMA (chave admin|gestor|membro); nunca num papel criado pelo ADM.
UPDATE `usuarios` SET `papel_id` = (SELECT `id` FROM `papeis` WHERE `papeis`.`chave` = `usuarios`.`role`)
WHERE (`papel_id` IS NULL OR `papel_id` IN (SELECT `id` FROM `papeis` WHERE `chave` IS NOT NULL))
  AND COALESCE(`papel_id`, -1) <> COALESCE((SELECT `id` FROM `papeis` WHERE `papeis`.`chave` = `usuarios`.`role`), -1);
