-- O RETRATO do DFD lido na Centi na última conferência (a correção campo a campo e a reconferência na Mesa, sem a
-- extensão) e o ACEITE da divergência (a Centi é que está errada — vale para AQUELE motivo).
CREATE TABLE `conferencias_centi_retrato` (
  `dfd_id` integer PRIMARY KEY NOT NULL REFERENCES `dfds`(`id`) ON DELETE cascade,
  `retrato` text NOT NULL,
  `em` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `dfds` ADD `conferencia_centi_aceite` text;
