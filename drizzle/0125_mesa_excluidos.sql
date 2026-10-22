-- LIXEIRA DA MESA: o retrato COMPLETO de cada protocolo, DFD e item excluído (gravado no mesmo lote da exclusão).
CREATE TABLE mesa_excluidos (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  tipo text NOT NULL,
  alvo_id integer NOT NULL,
  numero text,
  planejamento text,
  protocolo_id integer,
  protocolo_numero text,
  dfd_id integer,
  reparticao_id integer,
  pca_id integer,
  valor real,
  motivo text NOT NULL,
  retrato text,
  excluido_por integer,
  excluido_nome text,
  excluido_em text DEFAULT (CURRENT_TIMESTAMP),
  restaurado_em text
);
CREATE INDEX mesa_excluidos_tipo_idx ON mesa_excluidos (tipo, excluido_em);
CREATE INDEX mesa_excluidos_protocolo_idx ON mesa_excluidos (protocolo_id);
CREATE INDEX mesa_excluidos_dfd_idx ON mesa_excluidos (dfd_id);
