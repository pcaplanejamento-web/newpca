-- 0179 (v1.277.0): o PACOTE PRONTO da Execução. O texto que o banco monta (a CTE pesada) fica GUARDADO por chave (anos ·
-- etapas · escopo) e versão, em partes abaixo do limite de 2 MB por linha do D1: a tela só lê as partes; a montagem roda
-- uma vez por versão (com trava — um isolate por vez) e é antecipada pelo cron e pela promoção dos lotes. A parte 0 guarda
-- o pedido (para remontar sem a pessoa), o uso e a trava. Aditiva.
CREATE TABLE IF NOT EXISTS execucao_pacotes (
  chave TEXT NOT NULL,
  parte INTEGER NOT NULL,
  versao TEXT NOT NULL,
  partes INTEGER NOT NULL,
  texto TEXT NOT NULL,
  pedido TEXT,
  em TEXT NOT NULL,
  usado_em TEXT,
  montando_ate TEXT,
  PRIMARY KEY (chave, parte)
);
