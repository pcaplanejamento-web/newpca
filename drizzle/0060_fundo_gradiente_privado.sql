-- DEGRADÊ de fundo do quadro (JSON {cores, angulo} — no lugar de uma imagem) e o quadro PRIVADO (só quem criou o vê —
-- `criado_por`). Aditiva: NULL/0 = sem degradê e visível ao grupo, como hoje.
ALTER TABLE `tarefa_quadros` ADD `fundo_gradiente` text;
--> statement-breakpoint
ALTER TABLE `tarefa_quadros` ADD `privado` integer DEFAULT 0 NOT NULL;
