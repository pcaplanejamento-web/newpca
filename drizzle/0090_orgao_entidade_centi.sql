-- O ID da ENTIDADE do órgão na Centi (o seletor do topo da Centi: "02 - PREFEITURA…", "03 - FUNDO MUNICIPAL SAUDE…").
-- A Automação usa direto (Baixar DFDs, Verificar execução) — sem tentar entidade por entidade. Aditiva: NULL = não informado.
ALTER TABLE `orgaos` ADD `entidade_centi` text;
