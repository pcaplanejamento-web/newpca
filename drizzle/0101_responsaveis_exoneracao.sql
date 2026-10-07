-- RESPONSÁVEIS: a EXONERAÇÃO da pessoa ("AAAA-MM-DD"; NULL = em exercício). Aditiva: os vínculos da pessoa continuam
-- valendo; a partir da data ela não recebe vínculos novos (regra na aplicação — `motivoNaoVincular`).
ALTER TABLE `responsaveis` ADD `exonerado_em` text;
