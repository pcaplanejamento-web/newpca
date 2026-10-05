-- NOTIFICAÇÕES da pessoa (aditiva): quando foi LIDA (o relatório de alcance mede o tempo até a leitura), se o e-mail SAIU
-- de fato (o pulado não conta), o ADIAR ("lembrar em 1 h / amanhã") e o e-mail que só sai DEPOIS de um horário (o resumo
-- diário e o horário de silêncio da pessoa).
ALTER TABLE notificacoes ADD COLUMN lida_em text;
--> statement-breakpoint
ALTER TABLE notificacoes ADD COLUMN email_ok integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE notificacoes ADD COLUMN adiada_ate text;
--> statement-breakpoint
ALTER TABLE notificacoes ADD COLUMN email_apos text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notificacoes_criado_idx ON notificacoes (criado_em);
