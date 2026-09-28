-- ENQUADRAMENTO da imagem de fundo do quadro (JSON {x,y,zoom}: o ponto focal em % e o zoom) e a CAPA colorida do
-- cartão (hex; como a do Trello). Aditiva — NULL = centro/sem zoom e sem capa.
ALTER TABLE `tarefa_quadros` ADD `fundo_ajuste` text;
--> statement-breakpoint
ALTER TABLE `tarefas` ADD `capa` text;
