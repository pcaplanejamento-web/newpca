-- LIXEIRA DA MESA: as exclusões ANTIGAS (do histórico, sem retrato) que a pessoa limpou da lixeira — a chave da linha.
CREATE TABLE mesa_lixeira_descartados (
  chave text PRIMARY KEY NOT NULL,
  em text DEFAULT (CURRENT_TIMESTAMP)
);
