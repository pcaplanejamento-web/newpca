-- NOTIFICAÇÕES: limpeza de verdade, e-mail sem perda e desempenho (aditiva).
-- A RESERVA do e-mail com validade: o e-mail só conta como enviado quando o envio é confirmado; a reserva vencida volta.
ALTER TABLE notificacoes ADD COLUMN email_reservado_em text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notificacoes_tarefa_idx ON notificacoes (tarefa_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notificacoes_quadro_idx ON notificacoes (quadro_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notificacoes_usuario_id_idx ON notificacoes (usuario_id, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notificacoes_pendentes_idx ON notificacoes (id) WHERE email_enviado_em IS NULL;
--> statement-breakpoint
-- Os avisos DERIVADOS (prazo, lembrete) que a pessoa LIMPOU: não voltam até a chave vencer.
CREATE TABLE IF NOT EXISTS notificacoes_dispensadas (
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  chave text NOT NULL,
  ate text NOT NULL,
  PRIMARY KEY (usuario_id, chave)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notificacoes_dispensadas_ate_idx ON notificacoes_dispensadas (ate);
--> statement-breakpoint
-- O que ficou pendente para sempre (desistido ou velho demais) passa a tratado — a fila de envio só tem o que vale.
UPDATE notificacoes SET email_enviado_em = CURRENT_TIMESTAMP WHERE email_enviado_em IS NULL AND (email_tentativas >= 3 OR criado_em < datetime('now', '-2 days'));
