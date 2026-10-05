-- NOTIFICAÇÕES (aditiva): o aviso que a pessoa MARCOU como NÃO LIDO fica TRAVADO — ver de novo não o marca como lido
-- (só o toque no marcador ou abrir o aviso destravam).
ALTER TABLE notificacoes ADD COLUMN travada integer NOT NULL DEFAULT 0;
