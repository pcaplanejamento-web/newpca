-- 0181 (v1.283.0): SUBUNIDADE no item de PLANILHA. A planilha não traz centro de custo — a subunidade é ESCOLHIDA entre as
-- da unidade da planilha (`unidades.reparticao_id`); a leitura só a mostra quando ela é dessa unidade. Aditiva (NULL = sem).
ALTER TABLE itens ADD COLUMN subunidade_id integer REFERENCES subunidades(id) ON DELETE SET NULL;
CREATE INDEX itens_subunidade_idx ON itens (subunidade_id);
