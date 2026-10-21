-- FONTE DOS DADOS de cada aba, por grupo (v1.146.0): as abas em fonte ÚNICA (a soma de todas as unidades da pessoa,
-- ignorando a unidade do cabeçalho). As "funções das telas" da v1.144.0 saem (eram confundidas com o papel): limpas.
ALTER TABLE grupos ADD COLUMN fontes_abas text;
UPDATE grupos SET funcoes_off = NULL;
