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
/**
 * Órgão = entidade organizacional ACIMA da unidade (repartição). Toda unidade
 * pertence a um órgão (`reparticoes.orgao_id`). `orgao_entidade` é o padrão que
 * casa o campo "Órgão/Entidade" do DFD → órgão. Lista global ordenável.
 */
export const orgaos = sqliteTable(
  "orgaos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nome: text("nome").notNull(),
    sigla: text("sigla").notNull(),
    orgaoEntidade: text("orgao_entidade"), // padrão do "Órgão/Entidade" do DFD → órgão (match)
    ordem: integer("ordem").notNull().default(0),
    // Assinatura ÚNICA: 1 = os responsáveis do órgão valem p/ TODAS as unidades (guardados aqui);
    // 0 = cada unidade tem os seus (`reparticoes.responsavel_dfd`). Ver `responsaveisEfetivos`.
    assinaturaUnica: integer("assinatura_unica", { mode: "boolean" }).notNull().default(false),
    responsavelDfd: text("responsavel_dfd"), // responsáveis por DFDs do órgão (JSON), quando assinatura única
    numeroInteressado: text("numero_interessado"), // Interessado do protocolo → órgão (único GLOBAL com unidades)
    oculto: integer("oculto", { mode: "boolean" }).notNull().default(false), // ocultado (tem DFD/protocolo) — some do uso futuro
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("orgaos_ordem_idx").on(t.ordem)],
);

export const reparticoes = sqliteTable(
  "reparticoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    codigo: text("codigo").notNull(),
    nome: text("nome").notNull(),
    ordem: integer("ordem").notNull().default(0),
    numeroInteressado: text("numero_interessado"), // casa o Interessado do protocolo → unidade
    setorRequisitante: text("setor_requisitante"), // padrão do "Setor Requisitante" do DFD → unidade (match)
    orgaoId: integer("orgao_id").references(() => orgaos.id, { onDelete: "set null" }), // órgão dono da unidade
    // 1 = unidade "própria" do órgão (o órgão funciona TAMBÉM como unidade). Só uma por órgão,
    // só quando o órgão não tem unidades-filhas comuns. Ver `orgao-unidade-ops.ts`.
    orgaoProprio: integer("orgao_proprio", { mode: "boolean" }).notNull().default(false),
    responsavelDfd: text("responsavel_dfd"), // responsáveis por DFDs: JSON array de nomes (parseResponsaveis)
    oculto: integer("oculto", { mode: "boolean" }).notNull().default(false), // ocultada (tem DFD/protocolo) — some do uso futuro
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("reparticoes_ordem_idx").on(t.ordem), index("reparticoes_orgao_idx").on(t.orgaoId)],
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
 * Protocolo (o "processo" administrativo) que empacota VÁRIOS DFDs. Entidade do
 * domínio DFD, escopo por REPARTIÇÃO (como `dfds`/`unidades`; sem `grupo_id`).
 * `numero` = "Número Processo" da capa, único. Excluir o protocolo NÃO apaga os
 * DFDs — o vínculo `dfds.protocoloId` volta a NULL (FK `set null`).
 */
export const dfdProtocolos = sqliteTable(
  "dfd_protocolos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    numero: text("numero").notNull(), // "Número Processo" (ex.: "144756/2026")
    idExterno: text("id_externo"), // "Id:" da capa do processo (ex.: "2273524")
    data: text("data"),
    interessado: text("interessado"),
    documento: text("documento"), // CPF/CNPJ do interessado
    assunto: text("assunto"),
    observacao: text("observacao"),
    valorCapa: real("valor_capa"), // "Valor" da capa do processo
    anoPca: integer("ano_pca"), // ano do PCA do processo (adivinhado da capa OU definido pelo usuário)
    orgaoId: integer("orgao_id").references(() => orgaos.id, { onDelete: "set null" }), // órgão do protocolo (quando em nome do órgão)
    reparticaoId: integer("reparticao_id").references(() => reparticoes.id, {
      onDelete: "set null",
    }),
    localReparticao: text("local_reparticao"), // texto cru da capa (informativo)
    nomeArquivo: text("nome_arquivo"),
    // Totais (nº de DFDs, itens, valor somado) são recompostos AO VIVO em
    // `protocolo.ts` — o vínculo é dinâmico (link/unlink/re-import), como em `pcas`.
    criadoPor: integer("criado_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    uniqueIndex("protocolos_dfd_numero_uq").on(t.numero),
    index("protocolos_dfd_reparticao_idx").on(t.reparticaoId),
    index("protocolos_dfd_orgao_idx").on(t.orgaoId),
  ],
);

/**
 * DFD (Documento de Formalização da Demanda) — um formulário importado de `.xlsx`,
 * vinculado a uma repartição/órgão (auto-detectada pela sigla do Setor
 * Requisitante). Diferente da planilha achatada (`unidades`), o DFD traz metadados
 * de cabeçalho + uma tabela de itens SEM preço/classificação/data por item e um
 * único valor estimado total. Re-importar o mesmo `numero` substitui os itens.
 * Pode pertencer a ≤1 protocolo (`protocoloId`, opcional).
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
    orgaoId: integer("orgao_id").references(() => orgaos.id, { onDelete: "set null" }), // órgão identificado (Órgão/Entidade)
    reparticaoId: integer("reparticao_id").references(() => reparticoes.id, {
      onDelete: "set null",
    }),
    protocoloId: integer("protocolo_id").references(() => dfdProtocolos.id, {
      onDelete: "set null",
    }),
    responsavel: text("responsavel"),
    matricula: text("matricula"),
    email: text("email"),
    telefone: text("telefone"),
    anoPca: integer("ano_pca"), // ano do PCA (herdado do protocolo, ou definido no DFD avulso)
    // Renovação (DFD-R): referência do que se renova — capturada da descrição ou manual.
    numeroContrato: text("numero_contrato"),
    numeroAta: text("numero_ata"),
    numeroLicitacao: text("numero_licitacao"),
    valorEstimado: real("valor_estimado"), // estimativa da nota (Seção 4)
    valorTotal: real("valor_total"), // total da tabela (soma dos itens)
    secoes: text("secoes"), // JSON: {numero,titulo,texto}[] das demais seções
    assinaturas: text("assinaturas"), // JSON: Assinatura[] (assinaturas digitais do DFD)
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
    index("dfds_protocolo_idx").on(t.protocoloId),
    index("dfds_orgao_idx").on(t.orgaoId),
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
    valorUnitario: real("valor_unitario"),
    valorTotal: real("valor_total"),
    sequencial: integer("sequencial"), // ordem estável de exibição
  },
  (t) => [index("dfd_itens_dfd_idx").on(t.dfdId)],
);

/**
 * PCA — o plano consolidado da Prefeitura. Pode ser (a) uma **edição gerada** unindo
 * DFDs selecionados (`pcaDfds`, por referência; DFDs novos NÃO alteram uma edição já
 * gerada) OU (b) um **registro leve** cadastrado pelo ADM (nome + ano, sem DFDs). Os
 * totais são um retrato; o detalhe é recomposto ao vivo a partir dos DFDs. `ativo` marca
 * UM PCA como o vigente/padrão (migração `0020`).
 */
export const pcas = sqliteTable("pcas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(), // ex.: "PCA 2026"
  ano: integer("ano"),
  observacao: text("observacao"),
  ativo: integer("ativo", { mode: "boolean" }).default(false), // 1 = PCA vigente (só um)
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

/**
 * Catálogo de produtos — base de REFERÊNCIA para padronização de itens. Um catálogo
 * é importado de um PDF e traz itens com CÓDIGO (único GLOBAL), DESCRIÇÃO e UNIDADE
 * de medida. É ISOLADO (não referencia PCA/DFD/itens): serve só para consulta e para
 * a comparação futura contra os itens dos DFDs. `tipos_padrao` = tipos de DFD default
 * aplicados no envio; cada item guarda os seus em `tipos` (JSON de DFD-S/R/O/E).
 */
export const catalogos = sqliteTable("catalogos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  tiposPadrao: text("tipos_padrao").notNull().default("[]"), // JSON string[] de tipos de DFD
  totalItens: integer("total_itens").notNull().default(0),
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * Item de um catálogo. `codigo` é normalizado (só dígitos) e ÚNICO GLOBAL (índice
 * único) — o mesmo produto tem um código canônico. `codigo_raw` (exibição) também é
 * salvo SÓ com dígitos (= `codigo`; sem pontos/separadores). Excluir o catálogo apaga
 * os itens (cascade).
 */
export const catalogoItens = sqliteTable(
  "catalogo_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    catalogoId: integer("catalogo_id")
      .notNull()
      .references(() => catalogos.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(), // normalizado só-dígitos (único global)
    codigoRaw: text("codigo_raw"), // exibição — só dígitos (= codigo, sem pontos)
    descricao: text("descricao").notNull(),
    unidade: text("unidade"), // unidade de medida (UNIDADE/CAIXA/KG/PAR/PACOTE...)
    sequencial: integer("sequencial"), // "Item/Nº Seq" do arquivo (exibição)
    tipos: text("tipos").notNull().default("[]"), // JSON string[] de tipos de DFD do item
    // Catálogos ADICIONAIS em que o item está COMPARTILHADO (JSON number[]) — o mesmo item
    // em vários catálogos, sem duplicar a linha. Pertencimento = [catalogo_id, ...este].
    catalogosExtra: text("catalogos_extra").notNull().default("[]"),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("catalogo_itens_catalogo_idx").on(t.catalogoId),
    uniqueIndex("catalogo_itens_codigo_uq").on(t.codigo),
  ],
);

// Auditoria / histórico de alterações (APPEND-ONLY): quem (usuario_id + snapshot
// nome/email), o quê (acao/entidade/entidade_id + diff antes/depois JSON), quando.
export const auditoria = sqliteTable(
  "auditoria",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    usuarioNome: text("usuario_nome"), // snapshot — sobrevive à exclusão do usuário
    usuarioEmail: text("usuario_email"),
    acao: text("acao").notNull(), // criar|editar|excluir|importar|protocolar|login|...
    entidade: text("entidade").notNull(), // dfd|dfd_item|protocolo|catalogo|usuario|...
    entidadeId: integer("entidade_id"),
    resumo: text("resumo"), // texto legível ("Item 2: quantidade 20 → 35")
    antes: text("antes"), // JSON dos campos antes (edição/exclusão)
    depois: text("depois"), // JSON dos campos depois (criação/edição)
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("auditoria_entidade_idx").on(t.entidade, t.entidadeId),
    index("auditoria_usuario_idx").on(t.usuarioId),
    index("auditoria_criado_idx").on(t.criadoEm),
  ],
);

/**
 * ORÇAMENTO municipal (relatório CUBO). Cada `orcamentos` = um arquivo importado (nome +
 * ANO). É ISOLADO (não referencia PCA/DFD/itens): serve para consulta. Somente leitura —
 * importar/visualizar/excluir (reenviar). `valor_inicial` = Σ dotação (p/ o card).
 */
export const orcamentos = sqliteTable("orcamentos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  ano: integer("ano").notNull(),
  totalItens: integer("total_itens").notNull().default(0),
  valorInicial: real("valor_inicial").notNull().default(0), // Σ Valor Inicial (dotação)
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

/**
 * Lançamento (linha) de um orçamento — dotação por Órgão/Unidade/Elemento de despesa.
 * SEM chave única (muitas linhas compartilham o mesmo `codigo_elemento`). Excluir o
 * orçamento apaga os lançamentos (cascade).
 */
export const orcamentoItens = sqliteTable(
  "orcamento_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orcamentoId: integer("orcamento_id")
      .notNull()
      .references(() => orcamentos.id, { onDelete: "cascade" }),
    orgao: text("orgao"),
    unidade: text("unidade"),
    nomeElemento: text("nome_elemento"),
    codigoElemento: text("codigo_elemento"),
    valorEmendaImpositiva: real("valor_emenda_impositiva").notNull().default(0),
    valorInicial: real("valor_inicial").notNull().default(0),
    valorSuplementacao: real("valor_suplementacao").notNull().default(0),
    valorEmpenho: real("valor_empenho").notNull().default(0),
    saldo: real("saldo").notNull().default(0),
    valorAnulacao: real("valor_anulacao").notNull().default(0),
    sequencial: integer("sequencial"), // ordem no arquivo
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("orcamento_itens_orcamento_idx").on(t.orcamentoId)],
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
export type Orgao = typeof orgaos.$inferSelect;
export type NovoOrgao = typeof orgaos.$inferInsert;
export type DfdProtocolo = typeof dfdProtocolos.$inferSelect;
export type NovoDfdProtocolo = typeof dfdProtocolos.$inferInsert;
export type Dfd = typeof dfds.$inferSelect;
export type NovoDfd = typeof dfds.$inferInsert;
export type DfdItem = typeof dfdItens.$inferSelect;
export type NovoDfdItem = typeof dfdItens.$inferInsert;
export type Pca = typeof pcas.$inferSelect;
export type NovoPca = typeof pcas.$inferInsert;
export type PcaDfd = typeof pcaDfds.$inferSelect;
export type Catalogo = typeof catalogos.$inferSelect;
export type NovoCatalogo = typeof catalogos.$inferInsert;
export type CatalogoItem = typeof catalogoItens.$inferSelect;
export type NovoCatalogoItem = typeof catalogoItens.$inferInsert;
export type Auditoria = typeof auditoria.$inferSelect;
export type NovaAuditoria = typeof auditoria.$inferInsert;
export type Orcamento = typeof orcamentos.$inferSelect;
export type NovoOrcamento = typeof orcamentos.$inferInsert;
export type OrcamentoItem = typeof orcamentoItens.$inferSelect;
export type NovoOrcamentoItem = typeof orcamentoItens.$inferInsert;
