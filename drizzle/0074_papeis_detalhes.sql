-- DETALHES DO PAPEL (aditiva): o controle FINO dentro das telas que o papel já abre — as colunas das Mesas, o
-- Responsável (ver e alterar em 3 níveis), a Distribuição, as LINHAS ("só os meus" = em que é Responsável ou que
-- protocolou), o desempenho por pessoa, o histórico e as edições salvas das tabelas. JSON COMPACTO (núcleo
-- `papeis-detalhes-core.ts`): só o que difere do padrão — `{}` = sem restrições, exatamente o comportamento de antes.
-- Os índices em `criado_por` servem ao "só os meus" (quem protocolou o protocolo / criou o DFD avulso).
ALTER TABLE `papeis` ADD `detalhes` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `protocolos_dfd_criado_por_idx` ON `dfd_protocolos` (`criado_por`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `dfds_criado_por_idx` ON `dfds` (`criado_por`);
