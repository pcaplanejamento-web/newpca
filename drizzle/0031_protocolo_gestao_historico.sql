-- 0031 — Gestão do PROTOCOLO na Mesa + HISTÓRICO conectado (protocolo › DFD › item).
-- 1) SITUAÇÕES do protocolo: SÓ as cadastradas pelo ADM (Configurações → Situações) — nome, cor e
--    ordem. Excluir uma situação limpa a dos protocolos que a usavam (FK set null).
-- 2) RESPONSÁVEL (pessoa designada para cuidar do protocolo) e SITUAÇÃO em `dfd_protocolos`. A
--    DISTRIBUIÇÃO (quem protocolou) é o `criado_por` que já existe — sem coluna nova.
-- 3) RESPONSÁVEL PADRÃO do usuário (perfil): escolhido automaticamente ao protocolar.
-- 4) AUDITORIA: `protocolo_id` (o protocolo por onde a alteração passou — liga DFD/itens ao
--    histórico do protocolo), `origem` (canal: protocolação, reenvio, banner, edição em massa…) e
--    `detalhe` (JSON estruturado: campos/seções/assinaturas/itens alterados, antes → depois).
-- 100% ADITIVA (sem DROP/RENAME); os defaults NULL preservam o legado.
CREATE TABLE `protocolo_situacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor` text DEFAULT '#64748b' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` text DEFAULT (CURRENT_TIMESTAMP),
	`atualizado_em` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `protocolo_situacoes_ordem_idx` ON `protocolo_situacoes` (`ordem`);
--> statement-breakpoint
ALTER TABLE `dfd_protocolos` ADD `responsavel_id` integer REFERENCES usuarios(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `dfd_protocolos` ADD `situacao_id` integer REFERENCES protocolo_situacoes(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `protocolos_dfd_responsavel_idx` ON `dfd_protocolos` (`responsavel_id`);
--> statement-breakpoint
CREATE INDEX `protocolos_dfd_situacao_idx` ON `dfd_protocolos` (`situacao_id`);
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `responsavel_padrao_id` integer REFERENCES usuarios(id) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `auditoria` ADD `protocolo_id` integer;
--> statement-breakpoint
ALTER TABLE `auditoria` ADD `origem` text;
--> statement-breakpoint
ALTER TABLE `auditoria` ADD `detalhe` text;
--> statement-breakpoint
CREATE INDEX `auditoria_protocolo_idx` ON `auditoria` (`protocolo_id`);
