-- 0078 — TODA UNIDADE PERTENCE A UM ÓRGÃO (regra do usuário). Apaga as unidades SEM órgão que existem, menos a "Geral"
-- (virtual = todas as unidades, concedida por grupo). As FKs fazem o resto: o acesso grupo ↔ unidade cai (cascade) e
-- DFDs, protocolos, planilhas, vínculos do orçamento e a unidade de trabalho dos usuários ficam sem unidade (set null).
-- Daqui em diante a unidade só nasce dentro de um órgão e excluir o órgão exclui as unidades dele.
DELETE FROM `reparticoes` WHERE `orgao_id` IS NULL AND UPPER(`codigo`) <> 'GERAL';
