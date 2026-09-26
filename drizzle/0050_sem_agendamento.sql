-- 0050 — a PÁGINA PÚBLICA DE AGENDAMENTO saiu (o Calendário fica só com funções INTERNAS). A tabela da `0049` é removida
-- (os horários já marcados seguem como eventos comuns nas tarefas) e os avisos do sino desse tipo somem.
DROP TABLE IF EXISTS `agenda_paginas`;
--> statement-breakpoint
DELETE FROM `notificacoes` WHERE `tipo` = 'agendamento';
