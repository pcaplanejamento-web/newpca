-- PCA: marca UM PCA como o vigente/padrão (o ADM define nas Configurações). Também
-- habilita o "registro leve" (cadastrar PCA só por nome + ano, sem unir DFDs).
-- Nullable/0 por padrão (os PCAs já gravados ficam inativos).
ALTER TABLE `pcas` ADD `ativo` integer DEFAULT 0;
