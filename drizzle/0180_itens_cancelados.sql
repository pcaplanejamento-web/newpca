-- 0180 (v1.282.0): CANCELAR um item de PLANILHA no PCA. O item NÃO é excluído: fica cancelado (o sequencial dele também —
-- nunca reaproveitado nem sobrescrito por um upload) e sai dos números do PCA (Dashboard, Orçamento, cards, declarações).
-- Reativar limpa as três colunas. Aditiva (NULL = ativo).
ALTER TABLE itens ADD COLUMN cancelado_em text;
ALTER TABLE itens ADD COLUMN cancelado_por integer REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE itens ADD COLUMN cancelado_por_nome text;
