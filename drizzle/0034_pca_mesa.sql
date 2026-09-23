-- 0034 — Mesa do PCA INDEPENDENTE: o protocolo é ENVIADO a um PCA (sai da Mesa principal e vive na Mesa
-- daquele PCA) e, lá, INCORPORADO (os DFDs dele entram no PCA; enquanto incorporado, protocolo/DFDs/itens
-- ficam TRAVADOS para edição). Devolver = volta à Mesa principal (só sem incorporação).
-- 100% ADITIVA; excluir o PCA devolve os protocolos (FK set null).
ALTER TABLE `dfd_protocolos` ADD `pca_id` integer REFERENCES pcas(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `dfd_protocolos` ADD `pca_enviado_em` text;
--> statement-breakpoint
ALTER TABLE `dfd_protocolos` ADD `pca_enviado_por` integer REFERENCES usuarios(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `dfd_protocolos` ADD `pca_incorporado_em` text;
--> statement-breakpoint
CREATE INDEX `protocolos_dfd_pca_idx` ON `dfd_protocolos` (`pca_id`);
