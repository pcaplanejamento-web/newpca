-- UMA automação para conferir e corrigir DFDs × Centi. A "Corrigir DFDs divergentes pela Centi" vira "Conferir e corrigir
-- DFDs × Centi" (o MESMO registro: agenda, retomada e "Disponível na Mesa" ficam); a ajuda volta a ser a do modelo (NULL)
-- e a descrição é a nova. As antigas que faziam parte do mesmo trabalho saem — só quando o MESMO dono já tem a automação
-- única e nenhum fluxo que fica as usa como etapa. A retomada delas cai em cascata.
UPDATE `automacao_fluxos` SET `nome` = 'Conferir e corrigir DFDs × Centi', `ajuda` = NULL, `descricao` = 'Confere os DFDs do sistema com a Centi (cabeçalho, seções e itens), marca Convergente ou Divergente na coluna “Centi” e corrige na hora os divergentes — só o que diverge. Escolha quais DFDs (todos, por planejamento, nº, protocolo ou pela conferência gravada) e se corrige ou só confere. Se parar, continua de onde parou.', `atualizado_em` = CURRENT_TIMESTAMP WHERE `nome` = 'Corrigir DFDs divergentes pela Centi';
--> statement-breakpoint
UPDATE `automacao_fluxos` SET `ajuda` = NULL, `descricao` = 'A etapa de UM DFD do “Conferir e corrigir DFDs × Centi”: lê o DFD na Centi, compara tudo, marca a conferência e, se ele divergir e a correção estiver ligada, corrige só o que diverge.', `atualizado_em` = CURRENT_TIMESTAMP WHERE `nome` = 'Conferir e corrigir 1 DFD × Centi';
--> statement-breakpoint
DELETE FROM `automacao_fluxos`
WHERE `nome` IN ('Conferir DFDs × Centi', 'Conferir 1 DFD × Centi', 'DFDs de um protocolo × Centi (um por vez)', 'Substituir DFDs pelos dados da Centi')
  AND EXISTS (SELECT 1 FROM `automacao_fluxos` u WHERE u.`nome` = 'Conferir e corrigir DFDs × Centi' AND u.`criado_por` IS `automacao_fluxos`.`criado_por`)
  AND NOT EXISTS (
    SELECT 1 FROM `automacao_fluxos` o
    WHERE o.`id` <> `automacao_fluxos`.`id`
      AND o.`nome` NOT IN ('Conferir DFDs × Centi', 'Conferir 1 DFD × Centi', 'DFDs de um protocolo × Centi (um por vez)', 'Substituir DFDs pelos dados da Centi')
      AND (o.`grafo` LIKE '%"fluxoId":"' || `automacao_fluxos`.`id` || '"%' OR o.`grafo` LIKE '%"fluxoId":' || `automacao_fluxos`.`id` || ',%' OR o.`grafo` LIKE '%"fluxoId":' || `automacao_fluxos`.`id` || '}%')
  );
