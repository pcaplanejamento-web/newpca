-- Protocolo: "Id:" da capa do processo (ex.: "2273524"), lido do PDF e salvo ao
-- protocolar. Identificador interno do sistema de origem, distinto do "Número
-- Processo". Nullable (protocolos manuais e os já gravados ficam sem id externo).
ALTER TABLE `dfd_protocolos` ADD `id_externo` text;
