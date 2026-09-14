-- DFD: assinaturas digitais capturadas do PDF (página "Assinaturas Digitais").
-- JSON com a lista de assinaturas (nome, e-CPF, usuário, data, código verificador…).
-- Nullable (DFDs de .xlsx e os já gravados ficam sem assinatura).
ALTER TABLE `dfds` ADD `assinaturas` text;
