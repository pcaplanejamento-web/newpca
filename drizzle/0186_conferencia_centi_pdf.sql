-- O PDF que a Centi GEROU na conferência (o divergente) — guardado para conferir a olho o que a automação leu.
-- E: as conferências e retratos feitos desde a v1.295.13 pediram a emissão com o registro das seções 8 a 10 ADIVINHADO
-- (a "reserva"/a lista do load) — o PDF voltava com as seções de outro planejamento. Zera as marcações e os retratos.
CREATE TABLE `conferencias_centi_pdf` (
  `dfd_id` integer PRIMARY KEY NOT NULL REFERENCES `dfds`(`id`) ON DELETE cascade,
  `pdf` text NOT NULL,
  `em` text NOT NULL
);
--> statement-breakpoint
UPDATE `dfds` SET `conferencia_centi` = NULL, `conferencia_centi_motivo` = NULL, `conferencia_centi_em` = NULL, `conferencia_centi_aceite` = NULL WHERE `conferencia_centi` IS NOT NULL OR `conferencia_centi_aceite` IS NOT NULL OR `conferencia_centi_em` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `conferencias_centi_retrato`;
