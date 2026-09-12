import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
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
    // Repartição dona da unidade (definida no import pela repartição ativa no
    // head). NULL = importada em "Geral" — visível só na visão Geral.
    reparticaoId: integer("reparticao_id").references(() => reparticoes.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
    totalItens: integer("total_itens").default(0),
    valorTotal: real("valor_total").default(0),
  },
  (t) => [
    uniqueIndex("unidades_codigo_uq").on(t.codigo),
    index("unidades_reparticao_idx").on(t.reparticaoId),
  ],
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
    matricula: text("matricula"),
    foto: text("foto"), // data-URL base64 (avatar redimensionado no cliente)
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
    // Grupo dono do protocolo (dados por grupo). NULL = legado/sem grupo.
    grupoId: integer("grupo_id").references(() => grupos.id, { onDelete: "set null" }),
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
    index("protocolos_grupo_idx").on(t.grupoId),
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
    // Opções por grupo (cada grupo tem seu vocabulário). NULL = legado.
    grupoId: integer("grupo_id").references(() => grupos.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("protocolo_opcoes_uq").on(t.campo, t.valor, t.grupoId)],
);

/**
 * Configuração global da plataforma (linha única, id = 1). `dados` guarda a
 * APARÊNCIA controlada pelo ADM (tokens de cor claro/escuro + raio/densidade/
 * motion + identidade) num JSON validado. Injetada sem flash no RootLayout.
 */
export const configuracoes = sqliteTable("configuracoes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dados: text("dados").notNull().default("{}"),
  atualizadoPor: integer("atualizado_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * RBAC por GRUPO. Uma `permissao` define quais abas ficam disponíveis (JSON de
 * keys). Um `grupo` aponta para uma permissão; membros do grupo compartilham a
 * permissão E os dados (protocolos/opções carregam `grupo_id`). Um usuário pode
 * estar em vários grupos (`usuario_grupos`) e escolhe o ativo no cabeçalho.
 */
export const permissoes = sqliteTable("permissoes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  abas: text("abas").notNull().default("[]"), // JSON: string[] de keys de aba
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

export const grupos = sqliteTable("grupos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  permissaoId: integer("permissao_id").references(() => permissoes.id, { onDelete: "set null" }),
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

export const usuarioGrupos = sqliteTable(
  "usuario_grupos",
  {
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.grupoId] })],
);

/**
 * Repartições (secretarias/órgãos). Lista GLOBAL ordenável (arraste as linhas).
 * Cada grupo recebe acesso a um subconjunto (`grupo_reparticoes`); a repartição
 * ativa é escolhida no cabeçalho (cookie), entre as que o grupo ativo acessa.
 */
export const reparticoes = sqliteTable(
  "reparticoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    ordem: integer("ordem").notNull().default(0),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("reparticoes_ordem_idx").on(t.ordem)],
);

export const grupoReparticoes = sqliteTable(
  "grupo_reparticoes",
  {
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
    reparticaoId: integer("reparticao_id")
      .notNull()
      .references(() => reparticoes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.grupoId, t.reparticaoId] })],
);

/**
 * DFD (Documento de Formalização da Demanda) — um formulário importado de `.xlsx`,
 * vinculado a uma repartição/órgão (auto-detectada pela sigla do Setor
 * Requisitante). Diferente da planilha achatada (`unidades`), o DFD traz metadados
 * de cabeçalho + uma tabela de itens SEM preço/classificação/data por item e um
 * único valor estimado total. Re-importar o mesmo `numero` substitui os itens.
 */
export const dfds = sqliteTable(
  "dfds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    numero: text("numero").notNull(), // "Número DFD" — identidade do documento
    planejamento: text("planejamento"),
    tipo: text("tipo"), // ex.: "DFD-S — Solução / com ETP"
    objeto: text("objeto"), // natureza (ex.: "AQUISIÇÃO DE SERVIÇO")
    orgaoEntidade: text("orgao_entidade"),
    setorRequisitante: text("setor_requisitante"), // texto cru do DFD
    siglaSetor: text("sigla_setor"), // sigla extraída (ex.: "SMIR") p/ auto-match
    reparticaoId: integer("reparticao_id").references(() => reparticoes.id, {
      onDelete: "set null",
    }),
    responsavel: text("responsavel"),
    valorEstimado: real("valor_estimado"), // único total estimado do DFD
    nomeArquivo: text("nome_arquivo"),
    totalItens: integer("total_itens").default(0),
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    uniqueIndex("dfds_numero_uq").on(t.numero),
    index("dfds_reparticao_idx").on(t.reparticaoId),
  ],
);

/** Itens da Seção 4 do DFD (só quantidade — sem valor/classificação por item). */
export const dfdItens = sqliteTable(
  "dfd_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dfdId: integer("dfd_id")
      .notNull()
      .references(() => dfds.id, { onDelete: "cascade" }),
    item: integer("item"), // número do item na tabela do DFD
    codigo: text("codigo"), // código do catálogo (TEXT: preserva zeros/precisão)
    descricao: text("descricao"),
    unidade: text("unidade"), // unidade de medida (ex.: "DIAS")
    quantidade: real("quantidade"),
    sequencial: integer("sequencial"), // ordem estável de exibição
  },
  (t) => [index("dfd_itens_dfd_idx").on(t.dfdId)],
);

/**
 * Edição de PCA gerada — o plano consolidado da Prefeitura. Une DFDs selecionados
 * (`pcaDfds`, por referência): DFDs novos NÃO alteram uma edição já gerada. Os
 * totais são um retrato da geração; o detalhe é recomposto ao vivo a partir dos DFDs.
 */
export const pcas = sqliteTable("pcas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(), // ex.: "PCA 2026"
  ano: integer("ano"),
  observacao: text("observacao"),
  totalDfds: integer("total_dfds").default(0),
  totalItens: integer("total_itens").default(0),
  valorEstimado: real("valor_estimado").default(0), // soma dos estimados dos DFDs
  criadoPor: integer("criado_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

/** Vínculo N:N entre uma edição de PCA e os DFDs que ela une. */
export const pcaDfds = sqliteTable(
  "pca_dfds",
  {
    pcaId: integer("pca_id")
      .notNull()
      .references(() => pcas.id, { onDelete: "cascade" }),
    dfdId: integer("dfd_id")
      .notNull()
      .references(() => dfds.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.pcaId, t.dfdId] })],
);

export type Unidade = typeof unidades.$inferSelect;
export type NovaUnidade = typeof unidades.$inferInsert;
export type Item = typeof itens.$inferSelect;
export type NovoItem = typeof itens.$inferInsert;
export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
export type Sessao = typeof sessoes.$inferSelect;
export type Protocolo = typeof protocolos.$inferSelect;
export type NovoProtocolo = typeof protocolos.$inferInsert;
export type SituacaoProtocolo = Protocolo["situacao"];
export type ProtocoloOpcao = typeof protocoloOpcoes.$inferSelect;
export type CampoOpcao = ProtocoloOpcao["campo"];
export type Configuracao = typeof configuracoes.$inferSelect;
export type Permissao = typeof permissoes.$inferSelect;
export type Grupo = typeof grupos.$inferSelect;
export type UsuarioGrupo = typeof usuarioGrupos.$inferSelect;
export type Reparticao = typeof reparticoes.$inferSelect;
export type GrupoReparticao = typeof grupoReparticoes.$inferSelect;
export type Dfd = typeof dfds.$inferSelect;
export type NovoDfd = typeof dfds.$inferInsert;
export type DfdItem = typeof dfdItens.$inferSelect;
export type NovoDfdItem = typeof dfdItens.$inferInsert;
export type Pca = typeof pcas.$inferSelect;
export type NovoPca = typeof pcas.$inferInsert;
export type PcaDfd = typeof pcaDfds.$inferSelect;
