-- USUÁRIOS — contato institucional e controle do ADM (aditiva): o TELEFONE de contato (só dígitos: DDD + número) e se ele
-- tem WHATSAPP (cadastro e ADM); a VALIDAÇÃO dos dados pelo ADM (quando e por quem — o nome, sobrevive à exclusão; editar um
-- dado desfaz) e a TROCA DE SENHA OBRIGATÓRIA (1 = a pessoa cria uma senha nova antes de usar o sistema).
ALTER TABLE `usuarios` ADD `telefone` text;
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `telefone_whatsapp` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `dados_validados_em` text;
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `dados_validados_por` text;
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `trocar_senha` integer DEFAULT 0 NOT NULL;
