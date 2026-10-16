-- Responsável FUNCIONÁRIO DE FORA DO MUNICÍPIO (aditiva): não tem matrícula — a conferência não aponta "Sem matrícula".
ALTER TABLE `responsaveis` ADD COLUMN `externo` integer DEFAULT 0 NOT NULL;
