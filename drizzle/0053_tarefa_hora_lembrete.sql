-- 0053 — PRAZO COM HORA e LEMBRETE da tarefa (aditiva). `prazo_hora` "HH:MM" (NULL = o prazo vale o dia inteiro) e
-- `lembrete_min` (minutos antes do prazo; NULL = sem lembrete). A conclusão passa a valer NO LUGAR (a tarefa não sai da
-- lista) — sem mudança de dados.
ALTER TABLE `tarefas` ADD `prazo_hora` text;
--> statement-breakpoint
ALTER TABLE `tarefas` ADD `lembrete_min` integer;
