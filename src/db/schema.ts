import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
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
    // PCA (fonte "lista pronta") a que a planilha pertence — migração `0033`. O código é único POR PCA.
    pcaId: integer("pca_id").references((): AnySQLiteColumn => pcas.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("unidades_pca_codigo_uq").on(t.pcaId, t.codigo),
    index("unidades_reparticao_idx").on(t.reparticaoId),
    index("unidades_pca_idx").on(t.pcaId),
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
    // Apelido (perfil) — o nome de EXIBIÇÃO no sistema (Mesa, seletores, cabeçalho); sem ele, o nome.
    apelido: text("apelido"),
    role: text("role", { enum: ["admin", "gestor", "membro"] })
      .notNull()
      .default("membro"),
    status: text("status", { enum: ["ativo", "pendente", "inativo"] })
      .notNull()
      .default("pendente"),
    // Responsável PADRÃO ao protocolar (perfil): escolhido automaticamente como responsável do protocolo.
    responsavelPadraoId: integer("responsavel_padrao_id").references((): AnySQLiteColumn => usuarios.id, {
      onDelete: "set null",
    }),
    // Responsável com que a MESA abre (perfil, migração `0037`): "eu" (o padrão — NULL), "todos" (geral) ou "sem".
    mesaResponsavel: text("mesa_responsavel", { enum: ["eu", "todos", "sem"] }),
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
 * permissão E as unidades acessíveis (`grupo_reparticoes`). Um usuário pode
 * estar em vários grupos (`usuario_grupos`) e escolhe o ativo no cabeçalho.
 * (As tabelas `protocolos`/`protocolo_opcoes` do antigo módulo Protocolos ficam
 * no banco, DORMENTES — sem código; os protocolos vivem em `dfd_protocolos`.)
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
 * SITUAÇÕES do protocolo — SÓ as cadastradas pelo ADM (Configurações → Situações): nome, cor e ordem
 * (a do dropdown). Excluir uma situação limpa a dos protocolos que a usavam (FK `set null`).
 */
export const protocoloSituacoes = sqliteTable(
  "protocolo_situacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nome: text("nome").notNull(),
    cor: text("cor").notNull().default("#64748b"),
    ordem: integer("ordem").notNull().default(0),
    // `permite_mover_pca`/`camada_pca` (0033) ficam DORMENTES no banco desde a `0035` (a situação não interfere
    // mais no PCA) — sem código.
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("protocolo_situacoes_ordem_idx").on(t.ordem)],
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
    // GESTÃO na Mesa (migração 0031): pessoa designada para cuidar do protocolo e a situação
    // (só as cadastradas pelo ADM). A DISTRIBUIÇÃO (quem protocolou) é o `criadoPor`.
    responsavelId: integer("responsavel_id").references(() => usuarios.id, { onDelete: "set null" }),
    situacaoId: integer("situacao_id").references(() => protocoloSituacoes.id, { onDelete: "set null" }),
    // Mesa do PCA (migração `0034`): o PCA para onde o protocolo foi ENVIADO (sai da Mesa principal) e quando
    // foi INCORPORADO (≠ null ⇒ os DFDs estão no PCA e protocolo/DFDs/itens ficam TRAVADOS para edição).
    pcaId: integer("pca_id").references((): AnySQLiteColumn => pcas.id, { onDelete: "set null" }),
    pcaEnviadoEm: text("pca_enviado_em"),
    pcaEnviadoPor: integer("pca_enviado_por").references(() => usuarios.id, { onDelete: "set null" }),
    pcaIncorporadoEm: text("pca_incorporado_em"),
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
    index("protocolos_dfd_responsavel_idx").on(t.responsavelId),
    index("protocolos_dfd_situacao_idx").on(t.situacaoId),
    index("protocolos_dfd_pca_idx").on(t.pcaId),
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
    // DEPRECADO: a "estimativa da nota" foi removida — o valor do DFD é SÓ a soma dos itens
    // (`valorTotal`). Coluna mantida dormante (nenhum código lê/grava) p/ evitar migração de DROP.
    valorEstimado: real("valor_estimado"),
    valorTotal: real("valor_total"), // total do DFD = soma dos itens (zero se sem valores)
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

/**
 * RASTRO do DFD SOBRESCRITO entre protocolos (migração 0032): quando um DFD é sobrescrito por um DFD de
 * OUTRO protocolo (mesmo número), o protocolo de onde ele SAIU guarda um retrato leve da versão que tinha
 * (planejamento/tipo/sigla/itens/valor) — exibido em cinza, separado, apontando o protocolo ATUAL do DFD
 * (sempre o último da cadeia: o `dfds.protocolo_id` do DFD vivo de mesmo número). Um por (protocolo, nº);
 * sai quando o DFD volta a esse protocolo; excluir o protocolo apaga o rastro dele.
 */
export const dfdPassagens = sqliteTable(
  "dfd_passagens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    protocoloId: integer("protocolo_id")
      .notNull()
      .references(() => dfdProtocolos.id, { onDelete: "cascade" }),
    dfdNumero: text("dfd_numero").notNull(),
    planejamento: text("planejamento"),
    tipo: text("tipo"),
    sigla: text("sigla"),
    totalItens: integer("total_itens"),
    valorTotal: real("valor_total"),
    usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex("dfd_passagens_uq").on(t.protocoloId, t.dfdNumero), index("dfd_passagens_numero_idx").on(t.dfdNumero)],
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
    // Migração `0035`: o SEQUENCIAL do item no PCA (registrado no próprio item ao incorporar; ver `pcaItens`).
    pcaId: integer("pca_id").references((): AnySQLiteColumn => pcas.id, { onDelete: "set null" }),
    pcaSequencial: integer("pca_sequencial"),
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
  valorEstimado: real("valor_estimado").default(0), // total do PCA = soma dos valores (Σ itens) dos DFDs
  // PCA como ESPAÇO (migração `0033`): fonte dos dados, status de publicação, capa do card 4:5 e a
  // visão do orçamento usada no comparativo.
  fonte: text("fonte", { enum: ["lista", "protocolo"] }).notNull().default("lista"),
  status: text("status", { enum: ["preview", "publicado"] }).notNull().default("preview"),
  capa: text("capa"), // data-URL WebP 800×1000 (recorte 4:5)
  publicadoEm: text("publicado_em"),
  orcamentoVisaoId: integer("orcamento_visao_id").references((): AnySQLiteColumn => orcamentoVisoes.id, {
    onDelete: "set null",
  }),
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
    // Migração `0033`: a AÇÃO do DFD no PCA (incorporar/substituir/excluir), o DFD que ele substitui
    // e quem/quando vinculou.
    acao: text("acao", { enum: ["incorporar", "substituir", "excluir"] }).notNull().default("incorporar"),
    substituiDfdId: integer("substitui_dfd_id"),
    vinculadoPor: integer("vinculado_por").references(() => usuarios.id, { onDelete: "set null" }),
    vinculadoEm: text("vinculado_em"),
  },
  (t) => [primaryKey({ columns: [t.pcaId, t.dfdId] }), index("pca_dfds_dfd_idx").on(t.dfdId)],
);

/**
 * SEQUENCIAL do ITEM no PCA (migração `0035`): ao INCORPORAR um protocolo (permanente), cada item ganha um número
 * ÚNICO dentro do PCA (`pca_id` + `sequencial`). Retirar o item do PCA — ou o DFD deixar de ser vigente
 * (substituído/excluído) — só INATIVA o número (`ativo=0`); ele nunca é reaproveitado.
 */
export const pcaItens = sqliteTable(
  "pca_itens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pcaId: integer("pca_id")
      .notNull()
      .references(() => pcas.id, { onDelete: "cascade" }),
    sequencial: integer("sequencial").notNull(),
    dfdItemId: integer("dfd_item_id").references(() => dfdItens.id, { onDelete: "set null" }),
    dfdId: integer("dfd_id").references(() => dfds.id, { onDelete: "set null" }),
    protocoloId: integer("protocolo_id").references(() => dfdProtocolos.id, { onDelete: "set null" }),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    inativadoEm: text("inativado_em"),
    inativadoPor: integer("inativado_por").references(() => usuarios.id, { onDelete: "set null" }),
    motivo: text("motivo"),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex("pca_itens_pca_seq_uq").on(t.pcaId, t.sequencial), index("pca_itens_item_idx").on(t.dfdItemId)],
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

/**
 * PADRONIZAÇÃO dos itens (Catálogo → Classificações, migração `0038`): cada CLASSIFICAÇÃO tem nome + cor + ordem +
 * PALAVRAS-CHAVE (JSON string[]) — a classificação AUTOMÁTICA dos itens pela descrição (`padronizacao-core`).
 */
export const itemClassificacoes = sqliteTable(
  "item_classificacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nome: text("nome").notNull(),
    cor: text("cor").notNull().default("#64748b"),
    palavras: text("palavras").notNull().default("[]"),
    ordem: integer("ordem").notNull().default(0),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("item_classificacoes_ordem_idx").on(t.ordem)],
);

/**
 * UNIDADES DE MEDIDA cadastradas (Catálogo → Unidades de medida, migração `0038`): sigla + nome + SINÔNIMOS (JSON
 * string[] — as outras grafias aceitas: "UND", "UNID.") + ordem e a CLASSIFICAÇÃO que a unidade indica (usada quando a
 * descrição do item não tem palavra-chave). As unidades dos itens são COMPARADAS com este cadastro.
 */
export const unidadesMedida = sqliteTable(
  "unidades_medida",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sigla: text("sigla").notNull(),
    nome: text("nome").notNull(),
    sinonimos: text("sinonimos").notNull().default("[]"),
    classificacaoId: integer("classificacao_id").references(() => itemClassificacoes.id, { onDelete: "set null" }),
    ordem: integer("ordem").notNull().default(0),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("unidades_medida_ordem_idx").on(t.ordem)],
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
    // Histórico CONECTADO (migração 0031): o protocolo por onde a alteração passou (liga DFD/itens ao
    // histórico do protocolo), o canal (`origem`) e o DETALHE estruturado (campos/seções/itens).
    protocoloId: integer("protocolo_id"),
    origem: text("origem"),
    detalhe: text("detalhe"),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [
    index("auditoria_entidade_idx").on(t.entidade, t.entidadeId),
    index("auditoria_usuario_idx").on(t.usuarioId),
    index("auditoria_criado_idx").on(t.criadoEm),
    index("auditoria_protocolo_idx").on(t.protocoloId),
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
    // Classificação programática + fonte de recurso (novo padrão do CUBO, migração 0039).
    funcao: text("funcao"),
    programa: text("programa"),
    acao: text("acao"),
    ficha: text("ficha"),
    fonte: text("fonte"),
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

/**
 * VÍNCULO do texto de Órgão/Unidade do ORÇAMENTO (CUBO) com o cadastro do sistema. `chave` =
 * texto normalizado (`chaveVinculo`); `tipo` 'orgao' → `orgao_id`, 'unidade' → `reparticao_id`.
 * GLOBAL (vale p/ todos os orçamentos). Alvo NULL = sem vínculo (FK set null ao excluir o alvo).
 */
export const orcamentoVinculos = sqliteTable(
  "orcamento_vinculos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tipo: text("tipo", { enum: ["orgao", "unidade"] }).notNull(),
    chave: text("chave").notNull(),
    texto: text("texto").notNull(), // texto original do CUBO (exibição)
    orgaoId: integer("orgao_id").references(() => orgaos.id, { onDelete: "set null" }),
    reparticaoId: integer("reparticao_id").references(() => reparticoes.id, { onDelete: "set null" }),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex("orcamento_vinculos_tipo_chave_uq").on(t.tipo, t.chave)],
);

export type Unidade = typeof unidades.$inferSelect;
export type NovaUnidade = typeof unidades.$inferInsert;
export type Item = typeof itens.$inferSelect;
export type NovoItem = typeof itens.$inferInsert;
export type Usuario = typeof usuarios.$inferSelect;
export type NovoUsuario = typeof usuarios.$inferInsert;
export type Sessao = typeof sessoes.$inferSelect;
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

/**
 * VISÕES SALVAS do orçamento (migração `0033`): nome + `filtros` (JSON `{dimensão: valores[]}` —
 * vazio = "Todos"). Dentro da dimensão = OU; entre dimensões = E. Usadas pelo PCA (orçamento para o
 * PCA) e pela tela do Orçamento. Núcleo puro em `src/lib/orcamento-visao.ts`.
 */
/** Ajustes SALVOS de uma tabela, por usuário (migração `0040`): `chave` = a tabela/contexto (ex.:
 * `orcamento-comparativo:unidade:nomeElemento`), `valor` = JSON do layout (larguras, fixadas, ocultas, ordem). */
export const preferenciasTabela = sqliteTable(
  "preferencias_tabela",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    chave: text("chave").notNull(),
    valor: text("valor").notNull(),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [uniqueIndex("preferencias_tabela_uq").on(t.usuarioId, t.chave)],
);

/** EDIÇÕES SALVAS de uma tabela (migração `0041`): nome + layout (`valor` JSON), do usuário (`usuario_id`) — só para ele
 * ou PÚBLICA (`publico` = 1, todos veem). A padrão de cada usuário fica em `preferencias_tabela` (`padrao:<chave>`). */
export const edicoesTabela = sqliteTable(
  "edicoes_tabela",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chave: text("chave").notNull(),
    nome: text("nome").notNull(),
    valor: text("valor").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    publico: integer("publico", { mode: "boolean" }).notNull().default(false),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("edicoes_tabela_chave_idx").on(t.chave)],
);

export const orcamentoVisoes = sqliteTable("orcamento_visoes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nome: text("nome").notNull(),
  filtros: text("filtros").notNull().default("{}"),
  ordem: integer("ordem").notNull().default(0),
  criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// TAREFAS (migração `0042`) — quadro estilo Trello: QUADROS por grupo, LISTAS (colunas) e CARTÕES com nº de TICKET
// sequencial por quadro, responsáveis (pessoas do grupo), prazo, prioridade e ETIQUETAS.
// ---------------------------------------------------------------------------
export const tarefaQuadros = sqliteTable(
  "tarefa_quadros",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => grupos.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cor: text("cor").notNull().default("#6366f1"),
    descricao: text("descricao"),
    arquivado: integer("arquivado", { mode: "boolean" }).notNull().default(false),
    proxTicket: integer("prox_ticket").notNull().default(1),
    criadoPor: integer("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("tarefa_quadros_grupo_idx").on(t.grupoId)],
);

export const tarefaListas = sqliteTable(
  "tarefa_listas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quadroId: integer("quadro_id")
      .notNull()
      .references(() => tarefaQuadros.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    ordem: real("ordem").notNull().default(0),
    limiteWip: integer("limite_wip"),
    /** Lista de CONCLUÍDAS: o cartão que entra ganha `concluida_em`; o que sai perde. */
    concluida: integer("concluida", { mode: "boolean" }).notNull().default(false),
    arquivada: integer("arquivada", { mode: "boolean" }).notNull().default(false),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("tarefa_listas_quadro_idx").on(t.quadroId, t.ordem)],
);

export const tarefas = sqliteTable(
  "tarefas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quadroId: integer("quadro_id")
      .notNull()
      .references(() => tarefaQuadros.id, { onDelete: "cascade" }),
    listaId: integer("lista_id")
      .notNull()
      .references(() => tarefaListas.id, { onDelete: "cascade" }),
    ticket: integer("ticket").notNull(),
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    prioridade: text("prioridade").notNull().default("media"),
    /** Datas "AAAA-MM-DD". */
    inicio: text("inicio"),
    prazo: text("prazo"),
    /** Ordem FRACIONÁRIA na lista (soltar entre dois cartões sem renumerar a lista). */
    ordem: real("ordem").notNull().default(0),
    concluidaEm: text("concluida_em"),
    arquivada: integer("arquivada", { mode: "boolean" }).notNull().default(false),
    criadoPor: integer("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    atualizadoEm: text("atualizado_em").default(sql`(CURRENT_TIMESTAMP)`),
    /** Estimativa em horas (migração `0043`). */
    estimativaH: real("estimativa_h"),
    /** VÍNCULO com o sistema (`protocolo`/`dfd`/`pca`/`orcamento` + id) — sem FK: o alvo pode ser excluído depois. */
    vinculoTipo: text("vinculo_tipo"),
    vinculoId: integer("vinculo_id"),
    /** RECORRÊNCIA (migração `0044`): JSON `Recorrencia` (`tarefas-core`); NULL = não se repete. */
    recorrencia: text("recorrencia"),
    /** A ocorrência ANTERIOR da série (ÚNICO: concluir de novo nunca gera a próxima duas vezes). */
    recorrenciaAnteriorId: integer("recorrencia_anterior_id").references((): AnySQLiteColumn => tarefas.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("tarefas_quadro_ticket_uq").on(t.quadroId, t.ticket),
    uniqueIndex("tarefas_recorrencia_anterior_uq").on(t.recorrenciaAnteriorId),
    index("tarefas_lista_ordem_idx").on(t.listaId, t.ordem),
    index("tarefas_prazo_idx").on(t.prazo),
    index("tarefas_vinculo_idx").on(t.vinculoTipo, t.vinculoId),
  ],
);

export const tarefaPessoas = sqliteTable(
  "tarefa_pessoas",
  {
    tarefaId: integer("tarefa_id")
      .notNull()
      .references(() => tarefas.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    papel: text("papel").notNull().default("responsavel"),
  },
  (t) => [primaryKey({ columns: [t.tarefaId, t.usuarioId] }), index("tarefa_pessoas_usuario_idx").on(t.usuarioId)],
);

export const tarefaEtiquetas = sqliteTable(
  "tarefa_etiquetas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quadroId: integer("quadro_id")
      .notNull()
      .references(() => tarefaQuadros.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    cor: text("cor").notNull(),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [index("tarefa_etiquetas_quadro_idx").on(t.quadroId)],
);

export const tarefaEtiquetaLinks = sqliteTable(
  "tarefa_etiqueta_links",
  {
    tarefaId: integer("tarefa_id")
      .notNull()
      .references(() => tarefas.id, { onDelete: "cascade" }),
    etiquetaId: integer("etiqueta_id")
      .notNull()
      .references(() => tarefaEtiquetas.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.tarefaId, t.etiquetaId] })],
);

export const tarefaChecklist = sqliteTable(
  "tarefa_checklist",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tarefaId: integer("tarefa_id")
      .notNull()
      .references(() => tarefas.id, { onDelete: "cascade" }),
    texto: text("texto").notNull(),
    feito: integer("feito", { mode: "boolean" }).notNull().default(false),
    ordem: real("ordem").notNull().default(0),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("tarefa_checklist_tarefa_idx").on(t.tarefaId, t.ordem)],
);

export const tarefaComentarios = sqliteTable(
  "tarefa_comentarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tarefaId: integer("tarefa_id")
      .notNull()
      .references(() => tarefas.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    /** Snapshot do nome (o comentário sobrevive à exclusão do usuário). */
    usuarioNome: text("usuario_nome").notNull(),
    texto: text("texto").notNull(),
    /** JSON `number[]` — as pessoas citadas com @. */
    mencoes: text("mencoes").notNull().default("[]"),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
    editadoEm: text("editado_em"),
  },
  (t) => [index("tarefa_comentarios_tarefa_idx").on(t.tarefaId)],
);

export const tarefaAnexos = sqliteTable(
  "tarefa_anexos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tarefaId: integer("tarefa_id")
      .notNull()
      .references(() => tarefas.id, { onDelete: "cascade" }),
    /** `link` (url) | `arquivo` (conteudo = data-URL ≤ 1 MB). */
    tipo: text("tipo").notNull(),
    nome: text("nome").notNull(),
    url: text("url"),
    conteudo: text("conteudo"),
    mime: text("mime"),
    tamanho: integer("tamanho"),
    criadoPor: integer("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("tarefa_anexos_tarefa_idx").on(t.tarefaId)],
);

/** NOTIFICAÇÕES do sino (migração `0044`). `chave` = dedup das DERIVADAS (prazo) — única por pessoa. */
export const notificacoes = sqliteTable(
  "notificacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    texto: text("texto"),
    link: text("link"),
    tarefaId: integer("tarefa_id").references(() => tarefas.id, { onDelete: "cascade" }),
    quadroId: integer("quadro_id").references(() => tarefaQuadros.id, { onDelete: "cascade" }),
    atorId: integer("ator_id").references(() => usuarios.id, { onDelete: "set null" }),
    atorNome: text("ator_nome"),
    chave: text("chave"),
    lida: integer("lida", { mode: "boolean" }).notNull().default(false),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("notificacoes_usuario_idx").on(t.usuarioId, t.lida, t.id), uniqueIndex("notificacoes_chave_uq").on(t.usuarioId, t.chave)],
);

/** MODELOS de quadro (`grupo_id`) e de tarefa (`quadro_id`) — `conteudo` JSON (`tarefas-core`). */
export const tarefaModelos = sqliteTable(
  "tarefa_modelos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tipo: text("tipo").notNull(),
    grupoId: integer("grupo_id").references(() => grupos.id, { onDelete: "cascade" }),
    quadroId: integer("quadro_id").references(() => tarefaQuadros.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    conteudo: text("conteudo").notNull().default("{}"),
    criadoPor: integer("criado_por").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("tarefa_modelos_grupo_idx").on(t.tipo, t.grupoId), index("tarefa_modelos_quadro_idx").on(t.quadroId)],
);

/** AUTOMAÇÕES do quadro: "quando `gatilho` (na lista), fazer `acao`" (JSON). */
export const tarefaAutomacoes = sqliteTable(
  "tarefa_automacoes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quadroId: integer("quadro_id")
      .notNull()
      .references(() => tarefaQuadros.id, { onDelete: "cascade" }),
    gatilho: text("gatilho").notNull(),
    listaId: integer("lista_id").references(() => tarefaListas.id, { onDelete: "cascade" }),
    acao: text("acao").notNull(),
    ativa: integer("ativa", { mode: "boolean" }).notNull().default(true),
    criadoEm: text("criado_em").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => [index("tarefa_automacoes_quadro_idx").on(t.quadroId)],
);
