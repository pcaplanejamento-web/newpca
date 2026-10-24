-- LIQUIDAÇÕES EM PARALELO: os órgãos de um período passam a ser lidos ao mesmo tempo e cada passo guarda o total do PRÓPRIO
-- órgão (antes, acumulado em sequência). As importações de liquidações ainda abertas usam o formato anterior — são
-- encerradas (nada foi gravado nas liquidações; importe de novo) e o que leram sai do staging.
UPDATE `centi_lotes` SET `estado` = 'cancelado', `mensagem` = 'Encerrada: as liquidações passaram a ser lidas com todos os órgãos em paralelo — importe de novo.', `condutor` = NULL, `conduzindo_ate` = NULL, `concluido_em` = CURRENT_TIMESTAMP
WHERE `modo` = 'liquidacoes' AND `estado` = 'lendo';
--> statement-breakpoint
DELETE FROM `liquidacoes_staging` WHERE `lote_id` IN (SELECT `id` FROM `centi_lotes` WHERE `modo` = 'liquidacoes' AND `estado` = 'cancelado');
--> statement-breakpoint
DELETE FROM `centi_staging_fora` WHERE `lote_id` IN (SELECT `id` FROM `centi_lotes` WHERE `modo` = 'liquidacoes' AND `estado` = 'cancelado');
