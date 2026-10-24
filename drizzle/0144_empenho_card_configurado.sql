-- A configuração do card vem ANTES de qualquer importação: `configurado_em` = quando a Configuração foi confirmada
-- (salvar a aba Configuração). Sem ela (e sem vínculos), nada é lido da Centi nem importado — também na atualização
-- automática. Os cards que já importaram ou já têm vínculos contam como configurados.
ALTER TABLE `empenho_cards` ADD `configurado_em` text;
--> statement-breakpoint
UPDATE `empenho_cards` SET `configurado_em` = `atualizado_em`
WHERE `ultima_execucao` IS NOT NULL OR EXISTS (SELECT 1 FROM `empenho_card_vinculos` v WHERE v.`card_id` = `empenho_cards`.`id`);
