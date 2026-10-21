-- v1.141.0 — no modo "unidade de cadastro", o grupo escolhe POR TELA: só as unidades de cadastro da pessoa ou todas
-- (JSON {tela: "todas"}; ausente = de cadastro). E a pessoa pode ter VÁRIAS unidades de cadastro: a principal segue em
-- usuarios.reparticao_id e as demais nesta tabela.
ALTER TABLE grupos ADD COLUMN escopo_telas text;
CREATE TABLE usuario_reparticoes (
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  reparticao_id integer NOT NULL REFERENCES reparticoes(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, reparticao_id)
);
CREATE INDEX usuario_reparticoes_rep_idx ON usuario_reparticoes (reparticao_id);
