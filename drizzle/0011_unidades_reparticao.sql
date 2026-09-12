ALTER TABLE `unidades` ADD `reparticao_id` integer REFERENCES reparticoes(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `unidades_reparticao_idx` ON `unidades` (`reparticao_id`);
