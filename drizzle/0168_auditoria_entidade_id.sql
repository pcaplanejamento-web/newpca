-- O último id da auditoria POR ENTIDADE numa busca no índice (as versões de Tarefas, Agenda e Execução da sincronia).
CREATE INDEX IF NOT EXISTS `auditoria_entidade_id_idx` ON `auditoria` (`entidade`, `id`);
