-- v1.268.1: a automação "Unidades dos DFDs × Centro de Custo da CM002" só ESCREVE o Centro de Custo da Centi — a
-- comparação com o cadastro da unidade é do sistema. Sai a coluna "Centro de Custo confere" que a v1.268.0 criou, com os
-- valores dela (apagados antes, sem depender da cascata).
DELETE FROM `mesa_colunas_valores` WHERE `coluna_id` IN (SELECT `id` FROM `mesa_colunas` WHERE `entidade` = 'dfd' AND `chave` = 'centro de custo confere');
--> statement-breakpoint
DELETE FROM `mesa_colunas` WHERE `entidade` = 'dfd' AND `chave` = 'centro de custo confere';
