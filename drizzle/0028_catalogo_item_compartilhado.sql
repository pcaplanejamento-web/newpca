-- Item de catálogo COMPARTILHADO entre catálogos (o mesmo item em vários catálogos, sem
-- duplicar a linha). `catalogo_id` segue como catálogo de ORIGEM; `catalogos_extra` (JSON
-- number[]) guarda os catálogos ADICIONAIS. Pertencimento = [catalogo_id, ...catalogos_extra].
-- Aditiva (só ADD COLUMN) — preserva todo o legado (default = sem compartilhamento).
ALTER TABLE catalogo_itens ADD COLUMN catalogos_extra TEXT NOT NULL DEFAULT '[]';
