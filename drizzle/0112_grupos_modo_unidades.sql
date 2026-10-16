-- v1.115.0 — o grupo escolhe de onde vêm as unidades dos membros: as escolhidas (padrão) ou a unidade de cadastro de cada um.
ALTER TABLE grupos ADD COLUMN modo_unidades text NOT NULL DEFAULT 'lista';
