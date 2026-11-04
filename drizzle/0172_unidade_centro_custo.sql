-- v1.266.11 — o "Centro de Custo" da unidade, EXATAMENTE como a Centi escreve na CM002 ("PM RV, CAMARA MUNICIPAL,
-- GGIM" ou só o nome da unidade). A conferência das unidades casa por ele ANTES de qualquer comparação por nome.
ALTER TABLE `reparticoes` ADD `centro_custo` text;
