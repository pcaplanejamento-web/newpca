-- v1.133.0 — planilha CONSOLIDADA do PCA de lista pronta (uma linha por item com a coluna LOCAL): o domínio, a prioridade,
-- o Id do protocolo de origem (o "Id:" da capa — a chave da união com os protocolos incorporados) e a previsão genérica.
ALTER TABLE itens ADD COLUMN dominio text;
ALTER TABLE itens ADD COLUMN prioridade text;
ALTER TABLE itens ADD COLUMN protocolo_id_externo text;
ALTER TABLE itens ADD COLUMN previsao_generica text;
CREATE INDEX itens_protocolo_externo_idx ON itens (protocolo_id_externo);
