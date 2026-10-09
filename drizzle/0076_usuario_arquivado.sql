-- USUÁRIOS — ARQUIVAR em vez de excluir (aditiva): "Excluir" passa a ARQUIVAR (a conta fica inativa e fora da lista, com
-- todos os dados — grupos, papel, foto, preferências, responsabilidades —, e o ADM a RESTAURA); a exclusão DEFINITIVA só
-- vale para um arquivado. `arquivado_por` = o NOME de quem arquivou (sobrevive à exclusão dessa pessoa).
ALTER TABLE `usuarios` ADD `arquivado_em` text;
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `arquivado_por` text;
