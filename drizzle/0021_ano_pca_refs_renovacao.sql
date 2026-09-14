-- Ano do PCA (adivinhado da descrição OU definido pelo usuário) no protocolo e nos DFDs;
-- e as referências de RENOVAÇÃO do DFD-R (nº de contrato/ata/licitação), da descrição ou
-- preenchidas à mão. Tudo nullable (dados antigos ficam sem, sem quebrar).
ALTER TABLE `dfd_protocolos` ADD `ano_pca` integer;
ALTER TABLE `dfds` ADD `ano_pca` integer;
ALTER TABLE `dfds` ADD `numero_contrato` text;
ALTER TABLE `dfds` ADD `numero_ata` text;
ALTER TABLE `dfds` ADD `numero_licitacao` text;
