import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Uma "unidade" = uma planilha de PCA importada (identificada pelo Código +
 * Município do cabeçalho). Re-importar o mesmo Código substitui os itens.
 */
export const unidades = sqliteTable(
  "unidades",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // TEXT para preservar zeros à esquerda / códigos não numéricos.
    codigo: text("codigo").notNull(),
    municipio: text("municipio").notNull(),
    nomeArquivo: text("nome_arquivo"),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
    totalItens: integer("total_itens").default(0),
    valorTotal: real("valor_total").default(0),
  },
  (t) => [uniqueIndex("unidades_codigo_uq").on(t.codigo)],
);

export const itens = sqliteTable(
  "itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    unidadeId: integer("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    idProduto: text("id_produto"),
    sequencial: integer("sequencial"),
    nomeProduto: text("nome_produto"),
    unidadeMedida: text("unidade_medida"), // valor cru (exibição)
    unidadeMedidaNorm: text("unidade_medida_norm"), // canônico (agrupamento)
    quantidade: real("quantidade"),
    valorReferencia: real("valor_referencia"),
    valorTotal: real("valor_total"), // quantidade * valor_referencia
    classificacao: text("classificacao"), // valor cru (exibição)
    classificacaoNorm: text("classificacao_norm"), // canônico (agrupamento)
    dataDesejada: text("data_desejada"), // ISO yyyy-mm-dd
    mesDesejado: integer("mes_desejado"),
    anoDesejado: integer("ano_desejado"),
  },
  (t) => [
    index("itens_unidade_idx").on(t.unidadeId),
    index("itens_class_idx").on(t.classificacaoNorm),
    index("itens_periodo_idx").on(t.anoDesejado, t.mesDesejado),
  ],
);

/**
 * Usuários da plataforma. `role` = papel (RBAC básico); `status` controla o
 * acesso (o primeiro usuário cadastrado vira admin/ativo; os demais entram
 * como membro/pendente até um admin aprovar).
 */
export const usuarios = sqliteTable(
  "usuarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    nome: text("nome").notNull(),
    senhaHash: text("senha_hash").notNull(),
    role: text("role", { enum: ["admin", "gestor", "membro"] })
      .notNull()
      .default("membro"),
    status: text("status", { enum: ["ativo", "pendente", "inativo"] })
      .notNull()
      .default("pendente"),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex("usuarios_email_uq").on(t.email)],
);

/** Sessões (login por cookie). Guardamos apenas o hash do token. */
export const sessoes = sqliteTable(
  "sessoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEm: text("expira_em").notNull(),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    uniqueIndex("sessoes_token_uq").on(t.tokenHash),
    index("sessoes_usuario_idx").on(t.usuarioId),
  ],
);

/**
 * Tabelas dinâmicas ("listas de protocolos" e afins). Cada tabela tem colunas
 * personalizáveis (texto/seleção/data/número) e linhas cujos valores ficam num
 * JSON indexado por id da coluna. A "Distribuição de Protocolos" é a 1ª tabela.
 */
export const tabelas = sqliteTable("tabelas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  ordem: integer("ordem").notNull().default(0),
  criadoPor: integer("criado_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

export const colunas = sqliteTable(
  "colunas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tabelaId: integer("tabela_id")
      .notNull()
      .references(() => tabelas.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    tipo: text("tipo", { enum: ["texto", "selecao", "data", "numero"] })
      .notNull()
      .default("texto"),
    ordem: integer("ordem").notNull().default(0),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("colunas_tabela_idx").on(t.tabelaId)],
);

/** Opções das colunas do tipo "seleção". */
export const colunaOpcoes = sqliteTable(
  "coluna_opcoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    colunaId: integer("coluna_id")
      .notNull()
      .references(() => colunas.id, { onDelete: "cascade" }),
    valor: text("valor").notNull(),
  },
  (t) => [uniqueIndex("coluna_opcoes_uq").on(t.colunaId, t.valor)],
);

export const linhas = sqliteTable(
  "linhas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tabelaId: integer("tabela_id")
      .notNull()
      .references(() => tabelas.id, { onDelete: "cascade" }),
    dados: text("dados").notNull().default("{}"), // JSON { [colunaId]: valor }
    ordem: integer("ordem").notNull().default(0),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("linhas_tabela_idx").on(t.tabelaId)],
);

/**
 * Protocolos (módulo curado) — digitaliza a planilha "Distribuição de
 * Protocolos". Os campos de seleção (orgao/natureza/responsavel/distribuicao)
 * têm opções gerenciáveis em `protocoloOpcoes`; `situacao` é um enum fixo com
 * cores próprias na interface. Só `numero` é obrigatório.
 */
export const protocolos = sqliteTable(
  "protocolos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    numero: text("numero").notNull(),
    data: text("data"), // ISO yyyy-mm-dd (data do protocolo)
    orgao: text("orgao"),
    orgaoSigla: text("orgao_sigla"),
    natureza: text("natureza"),
    responsavel: text("responsavel"),
    situacao: text("situacao", {
      enum: ["em_analise", "em_andamento", "finalizado", "devolvido", "cancelado"],
    })
      .notNull()
      .default("em_analise"),
    distribuicao: text("distribuicao"),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("protocolos_situacao_idx").on(t.situacao),
    index("protocolos_natureza_idx").on(t.natureza),
    index("protocolos_responsavel_idx").on(t.responsavel),
    index("protocolos_data_idx").on(t.data),
  ],
);

/** Opções gerenciáveis dos campos de seleção do protocolo. */
export const protocoloOpcoes = sqliteTable(
  "protocolo_opcoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campo: text("campo", {
      enum: ["orgao", "natureza", "responsavel", "distribuicao"],
    }).notNull(),
    valor: text("valor").notNull(),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [uniqueIndex("protocolo_opcoes_uq").on(t.campo, t.valor)],
);

export type Unidade = typeof unidades.$inferSelect;
export type NovaUnidade = typeof unidades.$inferInsert;
export type Item = typeof itens.$inferSelect;
export type NovoItem = typeof itens.$inferInsert;
export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
export type Sessao = typeof sessoes.$inferSelect;
export type Tabela = typeof tabelas.$inferSelect;
export type Coluna = typeof colunas.$inferSelect;
export type ColunaOpcao = typeof colunaOpcoes.$inferSelect;
export type Linha = typeof linhas.$inferSelect;
export type TipoColuna = Coluna["tipo"];
export type Protocolo = typeof protocolos.$inferSelect;
export type NovoProtocolo = typeof protocolos.$inferInsert;
export type SituacaoProtocolo = Protocolo["situacao"];
export type ProtocoloOpcao = typeof protocoloOpcoes.$inferSelect;
export type CampoOpcao = ProtocoloOpcao["campo"];
