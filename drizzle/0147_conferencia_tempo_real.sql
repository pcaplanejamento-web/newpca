-- CONFERÊNCIA EM TEMPO REAL da importação (empenhos e liquidações): cada página é comparada com o que JÁ está gravado no
-- mesmo lote em que é lida. O registro IGUAL ao gravado não fica no staging — dele fica só a CHAVE (`igual` = 1), para a
-- conferência com a Centi e para saber o que sumiu; o novo e o alterado ficam até a conclusão. O passo guarda o resultado
-- da página: novos · alterados · iguais · sem vínculo (NULL nos passos de antes).
ALTER TABLE `centi_staging_fora` ADD `igual` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `centi_lote_passos` ADD `res_novos` integer;
--> statement-breakpoint
ALTER TABLE `centi_lote_passos` ADD `res_alterados` integer;
--> statement-breakpoint
ALTER TABLE `centi_lote_passos` ADD `res_iguais` integer;
--> statement-breakpoint
ALTER TABLE `centi_lote_passos` ADD `res_sem_vinculo` integer;
