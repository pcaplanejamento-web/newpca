/**
 * DETALHES DO PAPEL — o controle FINO dentro das telas que o papel já abre. Módulo PURO (cliente e servidor; testado).
 * As 6 ações (`papeis-core.ts`) dizem O QUE a pessoa faz em cada tela; os detalhes só RETIRAM: quais colunas das Mesas
 * ela vê, o Responsável (ver e alterar em 3 níveis), a Distribuição, as LINHAS ("só os meus"), o desempenho por pessoa, o
 * histórico, as edições salvas das tabelas, as alterações campo a campo, os dados pessoais e os valores. O efetivo = a
 * ação do papel **e** o detalhe (`mesa-visao-core.ts`); o Administrador ignora os detalhes (regra firme).
 *
 * `DETALHES_PADRAO` = o comportamento de ANTES dos detalhes (nada oculto, todas as linhas, tudo liberado): um papel sem
 * detalhes (`{}` no banco) segue igual. O banco guarda o COMPACTO (`compactarDetalhes` — só o que difere do padrão).
 */

// ---------------------------------------------------------------------------------------------------------------
// Vocabulário.
// ---------------------------------------------------------------------------------------------------------------

/** As 4 tabelas das Mesas (a do sistema e a de cada PCA usam as mesmas chaves). */
export const TABELAS_MESA = ["protocolos", "dfds", "itens", "consolidada"] as const;
export type TabelaMesa = (typeof TABELAS_MESA)[number];
export const ROTULO_TABELA_MESA: Record<TabelaMesa, string> = {
  protocolos: "Protocolos",
  dfds: "DFDs",
  itens: "Itens",
  consolidada: "Itens consolidados",
};

/** Alterar o Responsável: não altera · só assume para si (assumir o sem responsável e soltar o seu) · qualquer pessoa do
 * grupo (o de antes). */
export const NIVEIS_RESPONSAVEL = ["nao", "si", "grupo"] as const;
export type NivelResponsavel = (typeof NIVEIS_RESPONSAVEL)[number];
export const ROTULO_NIVEL_RESPONSAVEL: Record<NivelResponsavel, string> = {
  nao: "Não altera",
  si: "Só assume para si",
  grupo: "Qualquer pessoa do grupo",
};

/** O histórico: não vê · vê sem os autores · completo (o de antes). */
export const NIVEIS_HISTORICO = ["nao", "anonimo", "completo"] as const;
export type NivelHistorico = (typeof NIVEIS_HISTORICO)[number];
export const ROTULO_NIVEL_HISTORICO: Record<NivelHistorico, string> = { nao: "Não vê", anonimo: "Sem autores", completo: "Completo" };

/** As LINHAS da Mesa: todos os protocolos do escopo de unidades · só os meus (em que sou o Responsável ou que eu protocolei). */
export const LINHAS_MESA = ["todos", "meus"] as const;
export type LinhasMesa = (typeof LINHAS_MESA)[number];
export const ROTULO_LINHAS: Record<LinhasMesa, string> = { todos: "Todos os protocolos", meus: "Só os meus" };

/** Os dados pessoais dos documentos: ver · mascarar ("•••"). */
export const MODOS_DADOS_PESSOAIS = ["ver", "mascarar"] as const;
export type ModoDadosPessoais = (typeof MODOS_DADOS_PESSOAIS)[number];

/** O MANIPULAR da Mesa dividido por grupo de campos (o efetivo = Manipular na Mesa do recurso ∧ a sub-ação). */
export const SUBACOES_MESA = ["situacao", "capa", "dfd", "itens", "assinatura", "massa", "vincular", "enviarPca", "incorporar", "devolver"] as const;
export type SubAcaoMesa = (typeof SUBACOES_MESA)[number];
export const CATALOGO_SUBACOES: Record<SubAcaoMesa, { rotulo: string; descricao: string }> = {
  situacao: { rotulo: "Situação", descricao: "Trocar a Situação do protocolo (na célula, no banner e em massa)." },
  capa: { rotulo: "Capa do protocolo", descricao: "Interessado, CPF/CNPJ, assunto, observação, valor, local e a unidade do protocolo." },
  dfd: { rotulo: "Conteúdo do DFD", descricao: "Cabeçalho, tipo, unidade, seções e tratamento (prioridade, previsão, fundamentação) e referências." },
  itens: { rotulo: "Itens do DFD", descricao: "Editar, unificar e remover itens (também em massa)." },
  assinatura: { rotulo: "Validar assinatura", descricao: "Validar a assinatura pela equipe e desfazer a validação." },
  massa: { rotulo: "Edição em massa", descricao: "Aplicar alterações a vários protocolos, DFDs ou itens de uma vez (junto com a alteração do campo)." },
  vincular: { rotulo: "Vincular e mover DFD", descricao: "Vincular um DFD a um protocolo ou movê-lo para outro." },
  enviarPca: { rotulo: "Enviar ao PCA", descricao: "Enviar protocolos da Mesa do sistema à Mesa de um PCA (exige Manipular nas duas Mesas)." },
  incorporar: { rotulo: "Incorporar ao PCA", descricao: "Incorporar os protocolos enviados ao PCA (permanente)." },
  devolver: { rotulo: "Devolver à Mesa", descricao: "Devolver à Mesa do sistema um protocolo enviado e ainda não incorporado." },
};

/** Onde o histórico tem nível próprio: a Mesa do sistema, a Mesa do PCA e as Tarefas (também abertas pelo Calendário). */
export const TELAS_HISTORICO = ["dfd", "pca", "tarefas"] as const;
export type TelaHistorico = (typeof TELAS_HISTORICO)[number];

/** As telas com tabelas de EDIÇÕES SALVAS (a chave da edição diz a tela — `telasDaChave`). */
export const TELAS_EDICOES = ["dfd", "pca", "orcamento", "tarefas"] as const;
export type TelaEdicoes = (typeof TELAS_EDICOES)[number];
export const OPERACOES_EDICAO = ["personalizar", "publicar", "moderar"] as const;
export type OperacaoEdicao = (typeof OPERACOES_EDICAO)[number];
export const ROTULO_OPERACAO_EDICAO: Record<OperacaoEdicao, string> = { personalizar: "Personalizar", publicar: "Publicar", moderar: "Moderar" };
export const DESCRICAO_OPERACAO_EDICAO: Record<OperacaoEdicao, string> = {
  personalizar: "Editar a tabela (colunas, ordem, largura) e salvar as próprias edições.",
  publicar: "Salvar edições públicas, para todos (exige também Configurar na tela).",
  moderar: "Alterar ou excluir as edições públicas de outras pessoas (exige também Configurar na tela).",
};

const ROTULO_TELA_DETALHE: Record<TelaHistorico | TelaEdicoes, string> = {
  dfd: "Mesa",
  pca: "Mesa do PCA",
  orcamento: "Orçamento",
  tarefas: "Tarefas",
};
export const rotuloTelaDetalhe = (t: TelaHistorico | TelaEdicoes) => ROTULO_TELA_DETALHE[t];

// ---------------------------------------------------------------------------------------------------------------
// Catálogo das COLUNAS das Mesas (as chaves são as `Column.key` das tabelas — um teste estático confere).
// ---------------------------------------------------------------------------------------------------------------

/**
 * A classe de cada coluna:
 * - **fixa** — identificador ou conteúdo do documento: não se oculta (o cadeado diz o motivo).
 * - **coluna** — derivada/redundante: some das tabelas (e das listas que as alimentam), do filtro, da exportação e das
 *   edições; o documento aberto no banner segue completo.
 * - **dado** — some de TUDO na Mesa (listas, banners, APIs, Dashboard, filtros, exportação, histórico).
 *
 * `controle` = a coluna segue um controle de dado próprio (não se marca na lista de colunas): o Responsável, a
 * Distribuição ou os Valores.
 */
export type ClasseColuna = "fixa" | "coluna" | "dado";
export type ControleColuna = "responsavel" | "distribuicao" | "valores";
export type ColunaMesaInfo = {
  chave: string;
  rotulo: string;
  classe: ClasseColuna;
  /** Por que a coluna é fixa (o cadeado). */
  motivo?: string;
  controle?: ControleColuna;
  /** Só numa das Mesas (a do sistema ou a do PCA). */
  so?: "sistema" | "pca";
};

const FIXA_ID = "Identificador — não se oculta.";
const FIXA_DOC = "Conteúdo do documento — não se oculta.";
const FIXA_ESCOPO = "É o escopo de acesso (unidade) — não se oculta.";
const FIXA_ESTRUTURA = "Estrutura do processo — não se oculta.";
const FIXA_PCA = "Faz parte do fluxo do PCA — não se oculta.";

export const CATALOGO_COLUNAS_MESA: Record<TabelaMesa, readonly ColunaMesaInfo[]> = {
  protocolos: [
    { chave: "estado", rotulo: "Estado", classe: "coluna" },
    { chave: "situacao", rotulo: "Situação", classe: "dado" },
    { chave: "responsavel", rotulo: "Responsável", classe: "dado", controle: "responsavel" },
    { chave: "distribuicao", rotulo: "Distribuição", classe: "dado", controle: "distribuicao" },
    { chave: "data", rotulo: "Data da protocolação", classe: "dado" },
    { chave: "numero", rotulo: "Nº processo", classe: "fixa", motivo: FIXA_ID },
    { chave: "idExterno", rotulo: "Id protocolo", classe: "fixa", motivo: FIXA_ID },
    { chave: "assunto", rotulo: "Assunto", classe: "fixa", motivo: "Decide a categoria e as regras da conferência — não se oculta." },
    { chave: "reparticao", rotulo: "Unidade", classe: "fixa", motivo: FIXA_ESCOPO },
    { chave: "pca", rotulo: "PCA / Local", classe: "fixa", motivo: FIXA_PCA },
    { chave: "dfds", rotulo: "DFDs", classe: "fixa", motivo: FIXA_ESTRUTURA },
    { chave: "itens", rotulo: "Itens", classe: "fixa", motivo: FIXA_ESTRUTURA },
    { chave: "valor", rotulo: "Valor", classe: "dado", controle: "valores" },
  ],
  dfds: [
    { chave: "estado", rotulo: "Estado", classe: "coluna" },
    { chave: "planejamento", rotulo: "Nº Plan.", classe: "fixa", motivo: FIXA_ID },
    { chave: "numero", rotulo: "Nº DFD", classe: "fixa", motivo: FIXA_ID },
    { chave: "sigla", rotulo: "Sigla", classe: "fixa", motivo: FIXA_ESCOPO },
    { chave: "tipo", rotulo: "Tipo", classe: "fixa", motivo: FIXA_DOC },
    { chave: "prioridade", rotulo: "Prioridade", classe: "coluna" },
    { chave: "assinatura", rotulo: "Assinatura", classe: "coluna" },
    { chave: "protocolo", rotulo: "Protocolo", classe: "fixa", motivo: FIXA_ID },
    { chave: "pca", rotulo: "PCA", classe: "fixa", motivo: FIXA_PCA, so: "sistema" },
    { chave: "itens", rotulo: "Itens", classe: "fixa", motivo: FIXA_ESTRUTURA },
    { chave: "valor", rotulo: "Valor total", classe: "dado", controle: "valores" },
  ],
  itens: [
    { chave: "pcaSeq", rotulo: "Seq. PCA", classe: "fixa", motivo: FIXA_PCA, so: "pca" },
    { chave: "estado", rotulo: "Estado", classe: "coluna" },
    { chave: "protocolo", rotulo: "Protocolo", classe: "fixa", motivo: FIXA_ID },
    { chave: "pca", rotulo: "PCA", classe: "fixa", motivo: FIXA_PCA, so: "sistema" },
    { chave: "planejamento", rotulo: "Nº Plan.", classe: "fixa", motivo: FIXA_ID },
    { chave: "dfd", rotulo: "Nº DFD", classe: "fixa", motivo: FIXA_ID },
    { chave: "sigla", rotulo: "Sigla", classe: "fixa", motivo: FIXA_ESCOPO },
    { chave: "tipo", rotulo: "Tipo", classe: "fixa", motivo: FIXA_DOC },
    { chave: "prioridade", rotulo: "Prioridade", classe: "coluna" },
    { chave: "item", rotulo: "Item", classe: "fixa", motivo: FIXA_ID },
    { chave: "codigo", rotulo: "Código", classe: "fixa", motivo: FIXA_ID },
    { chave: "catalogo", rotulo: "Catálogo", classe: "coluna" },
    { chave: "classificacao", rotulo: "Classificação", classe: "coluna" },
    { chave: "descricao", rotulo: "Descrição", classe: "fixa", motivo: FIXA_DOC },
    { chave: "unidade", rotulo: "Unidade", classe: "fixa", motivo: FIXA_DOC },
    { chave: "unidCad", rotulo: "Unid. cadastrada", classe: "coluna" },
    { chave: "qtd", rotulo: "Qtd.", classe: "fixa", motivo: FIXA_DOC },
    { chave: "vunit", rotulo: "Vlr. unit.", classe: "dado", controle: "valores" },
    { chave: "vtotal", rotulo: "Vlr. total", classe: "dado", controle: "valores" },
  ],
  consolidada: [
    { chave: "pcaSeq", rotulo: "Seq. PCA", classe: "fixa", motivo: FIXA_PCA, so: "pca" },
    { chave: "estado", rotulo: "Estado", classe: "coluna" },
    { chave: "codigo", rotulo: "Código", classe: "fixa", motivo: "Chave da consolidação — não se oculta." },
    { chave: "catalogo", rotulo: "Catálogo", classe: "coluna" },
    { chave: "classificacao", rotulo: "Classificação", classe: "coluna" },
    { chave: "descricao", rotulo: "Descrição", classe: "fixa", motivo: FIXA_DOC },
    { chave: "unidade", rotulo: "Unidade", classe: "fixa", motivo: FIXA_DOC },
    { chave: "unidCad", rotulo: "Unid. cadastrada", classe: "coluna" },
    { chave: "qtd", rotulo: "Qtd. total", classe: "fixa", motivo: FIXA_DOC },
    { chave: "vmedio", rotulo: "Vlr. unit. médio", classe: "dado", controle: "valores" },
    { chave: "variacao", rotulo: "Variação", classe: "coluna" },
    { chave: "vtotal", rotulo: "Vlr. total", classe: "dado", controle: "valores" },
    { chave: "abc", rotulo: "ABC", classe: "coluna" },
    { chave: "itens", rotulo: "Itens", classe: "fixa", motivo: FIXA_ESTRUTURA },
    { chave: "planejamento", rotulo: "Nº Plan.", classe: "fixa", motivo: FIXA_ID },
    { chave: "dfd", rotulo: "Nº DFD", classe: "fixa", motivo: FIXA_ID },
    { chave: "protocolo", rotulo: "Protocolo", classe: "fixa", motivo: FIXA_ID },
    { chave: "sigla", rotulo: "Sigla", classe: "fixa", motivo: FIXA_ESCOPO },
    { chave: "tipo", rotulo: "Tipo", classe: "fixa", motivo: FIXA_DOC },
    { chave: "pca", rotulo: "PCA", classe: "fixa", motivo: FIXA_PCA, so: "sistema" },
    { chave: "prioridade", rotulo: "Prioridade", classe: "coluna" },
  ],
};

/** As colunas que se marcam na LISTA de colunas (as ocultáveis sem controle próprio). */
export const colunasOcultaveis = (tabela: TabelaMesa): ColunaMesaInfo[] =>
  CATALOGO_COLUNAS_MESA[tabela].filter((c) => c.classe !== "fixa" && !c.controle);

const ehOcultavel = (tabela: TabelaMesa, chave: string) => colunasOcultaveis(tabela).some((c) => c.chave === chave);

// ---------------------------------------------------------------------------------------------------------------
// O tipo, o padrão e a normalização.
// ---------------------------------------------------------------------------------------------------------------

export type EdicoesTela = Record<OperacaoEdicao, boolean>;

export type DetalhesMesa = {
  /** As colunas OCULTAS por tabela (lista negativa — uma coluna nova nasce visível). */
  colunasOcultas: Record<TabelaMesa, string[]>;
  responsavel: { ver: boolean; alterar: NivelResponsavel };
  distribuicao: boolean;
  linhas: LinhasMesa;
  desempenho: boolean;
  dadosPessoais: ModoDadosPessoais;
  valores: boolean;
  alteracoes: Record<SubAcaoMesa, boolean>;
};

export type DetalhesPapel = {
  mesa: DetalhesMesa;
  historico: Record<TelaHistorico, NivelHistorico>;
  edicoes: Record<TelaEdicoes, EdicoesTela>;
};

const todas = <K extends string>(chaves: readonly K[], v: boolean) => Object.fromEntries(chaves.map((k) => [k, v])) as Record<K, boolean>;

/** O papel SEM restrições — o comportamento de antes dos detalhes. */
export function detalhesPadrao(): DetalhesPapel {
  return {
    mesa: {
      colunasOcultas: { protocolos: [], dfds: [], itens: [], consolidada: [] },
      responsavel: { ver: true, alterar: "grupo" },
      distribuicao: true,
      linhas: "todos",
      desempenho: true,
      dadosPessoais: "ver",
      valores: true,
      alteracoes: todas(SUBACOES_MESA, true),
    },
    historico: { dfd: "completo", pca: "completo", tarefas: "completo" },
    edicoes: { dfd: todas(OPERACOES_EDICAO, true), pca: todas(OPERACOES_EDICAO, true), orcamento: todas(OPERACOES_EDICAO, true), tarefas: todas(OPERACOES_EDICAO, true) },
  };
}
export const DETALHES_PADRAO: DetalhesPapel = detalhesPadrao();

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);
const umDe = <T extends string>(v: unknown, lista: readonly T[], padrao: T): T => (lista.includes(v as T) ? (v as T) : padrao);

/**
 * Normaliza QUALQUER valor (JSON gravado, corpo da requisição) sobre o padrão: só chaves e níveis que existem, colunas
 * ocultáveis do catálogo (sem repetir, na ordem do catálogo) e as IMPLICAÇÕES:
 * - não ver o Responsável ⇒ não altera;
 * - sem Responsável e sem Distribuição à vista ⇒ sem desempenho por pessoa (não há por quem agrupar);
 * - Situação oculta ⇒ não altera a Situação;
 * - Valores ocultos ⇒ não altera os itens nem a capa (a regravação dos itens apagaria os valores que não vieram);
 * - sem personalizar ⇒ sem publicar nem moderar.
 * Idempotente; lixo = o padrão.
 */
export function coerceDetalhes(bruto: unknown): DetalhesPapel {
  const o = obj(bruto);
  const m = obj(o.mesa);

  const col = obj(m.colunasOcultas);
  const colunasOcultas = {} as Record<TabelaMesa, string[]>;
  for (const t of TABELAS_MESA) {
    const lista = Array.isArray(col[t]) ? new Set((col[t] as unknown[]).filter((x): x is string => typeof x === "string")) : new Set<string>();
    colunasOcultas[t] = colunasOcultaveis(t)
      .map((c) => c.chave)
      .filter((c) => lista.has(c));
  }
  const r = obj(m.responsavel);
  const ver = bool(r.ver, true);
  const alterar = ver ? umDe(r.alterar, NIVEIS_RESPONSAVEL, "grupo") : "nao";
  const distribuicao = bool(m.distribuicao, true);
  const valores = bool(m.valores, true);
  const alt = obj(m.alteracoes);
  const alteracoes = Object.fromEntries(SUBACOES_MESA.map((s) => [s, bool(alt[s], true)])) as Record<SubAcaoMesa, boolean>;
  if (colunasOcultas.protocolos.includes("situacao")) alteracoes.situacao = false;
  if (!valores) {
    alteracoes.itens = false;
    alteracoes.capa = false;
  }
  const mesa: DetalhesMesa = {
    colunasOcultas,
    responsavel: { ver, alterar },
    distribuicao,
    linhas: umDe(m.linhas, LINHAS_MESA, "todos"),
    desempenho: ver || distribuicao ? bool(m.desempenho, true) : false,
    dadosPessoais: umDe(m.dadosPessoais, MODOS_DADOS_PESSOAIS, "ver"),
    valores,
    alteracoes,
  };

  const h = obj(o.historico);
  const historico = Object.fromEntries(TELAS_HISTORICO.map((t) => [t, umDe(h[t], NIVEIS_HISTORICO, "completo")])) as Record<TelaHistorico, NivelHistorico>;

  const e = obj(o.edicoes);
  const edicoes = {} as Record<TelaEdicoes, EdicoesTela>;
  for (const t of TELAS_EDICOES) {
    const et = obj(e[t]);
    const personalizar = bool(et.personalizar, true);
    edicoes[t] = { personalizar, publicar: personalizar && bool(et.publicar, true), moderar: personalizar && bool(et.moderar, true) };
  }
  return { mesa, historico, edicoes };
}

/** A coluna está oculta nos detalhes (só as ocultáveis da lista — as de controle próprio seguem o controle). */
export const colunaOcultaNosDetalhes = (d: DetalhesPapel, tabela: TabelaMesa, chave: string) => d.mesa.colunasOcultas[tabela].includes(chave);

/** Oculta/mostra uma coluna ocultável (normalizado). */
export function alternarColunaOculta(d: DetalhesPapel, tabela: TabelaMesa, chave: string, ocultar: boolean): DetalhesPapel {
  if (!ehOcultavel(tabela, chave)) return coerceDetalhes(d);
  const atual = new Set(d.mesa.colunasOcultas[tabela]);
  if (ocultar) atual.add(chave);
  else atual.delete(chave);
  return coerceDetalhes({ ...d, mesa: { ...d.mesa, colunasOcultas: { ...d.mesa.colunasOcultas, [tabela]: [...atual] } } });
}

/**
 * O COMPACTO que vai ao banco: só o que difere do padrão (`{}` = sem restrições). `coerceDetalhes(compactarDetalhes(d))`
 * devolve `d` normalizado.
 */
export function compactarDetalhes(bruto: DetalhesPapel): Record<string, unknown> {
  const d = coerceDetalhes(bruto);
  const p = DETALHES_PADRAO;
  const out: Record<string, unknown> = {};
  const mesa: Record<string, unknown> = {};
  const col: Record<string, string[]> = {};
  for (const t of TABELAS_MESA) if (d.mesa.colunasOcultas[t].length) col[t] = d.mesa.colunasOcultas[t];
  if (Object.keys(col).length) mesa.colunasOcultas = col;
  const resp: Record<string, unknown> = {};
  if (d.mesa.responsavel.ver !== p.mesa.responsavel.ver) resp.ver = d.mesa.responsavel.ver;
  if (d.mesa.responsavel.alterar !== p.mesa.responsavel.alterar) resp.alterar = d.mesa.responsavel.alterar;
  if (Object.keys(resp).length) mesa.responsavel = resp;
  for (const k of ["distribuicao", "linhas", "desempenho", "dadosPessoais", "valores"] as const) if (d.mesa[k] !== p.mesa[k]) mesa[k] = d.mesa[k];
  const alt: Record<string, boolean> = {};
  for (const s of SUBACOES_MESA) if (d.mesa.alteracoes[s] !== p.mesa.alteracoes[s]) alt[s] = d.mesa.alteracoes[s];
  if (Object.keys(alt).length) mesa.alteracoes = alt;
  if (Object.keys(mesa).length) out.mesa = mesa;
  const hist: Record<string, string> = {};
  for (const t of TELAS_HISTORICO) if (d.historico[t] !== p.historico[t]) hist[t] = d.historico[t];
  if (Object.keys(hist).length) out.historico = hist;
  const ed: Record<string, Record<string, boolean>> = {};
  for (const t of TELAS_EDICOES) {
    const et: Record<string, boolean> = {};
    for (const op of OPERACOES_EDICAO) if (d.edicoes[t][op] !== p.edicoes[t][op]) et[op] = d.edicoes[t][op];
    if (Object.keys(et).length) ed[t] = et;
  }
  if (Object.keys(ed).length) out.edicoes = ed;
  return out;
}

/** O JSON gravado (texto) → os detalhes normalizados (inválido = o padrão). */
export function detalhesDoJson(json: string | null | undefined): DetalhesPapel {
  try {
    return coerceDetalhes(JSON.parse(json ?? "{}"));
  } catch {
    return detalhesPadrao();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Cada detalhe como uma LINHA (rótulo + valor + quanto libera) — a comparação, o resumo e a auditoria saem daqui.
// ---------------------------------------------------------------------------------------------------------------

export type GrupoDetalhe = "Mesa" | "Mesa do PCA" | "Orçamento" | "Tarefas";

type ItemDetalhe = {
  id: string;
  grupo: GrupoDetalhe;
  rotulo: string;
  /** O valor à vista ("Visível", "Só os meus"…). */
  valor: (d: DetalhesPapel) => string;
  /** Quanto libera (maior = mais acesso) — diz se uma mudança RESTRINGE. */
  nivel: (d: DetalhesPapel) => number;
};

const simNao = (v: boolean, sim = "Visível", nao = "Oculto") => (v ? sim : nao);
const ordemNivel = <T extends string>(lista: readonly T[], v: T) => lista.indexOf(v);

function itensDetalhe(): ItemDetalhe[] {
  const out: ItemDetalhe[] = [
    { id: "mesa.responsavel.ver", grupo: "Mesa", rotulo: "Responsável", valor: (d) => simNao(d.mesa.responsavel.ver), nivel: (d) => +d.mesa.responsavel.ver },
    {
      id: "mesa.responsavel.alterar",
      grupo: "Mesa",
      rotulo: "Alterar o Responsável",
      valor: (d) => ROTULO_NIVEL_RESPONSAVEL[d.mesa.responsavel.alterar],
      nivel: (d) => ordemNivel(NIVEIS_RESPONSAVEL, d.mesa.responsavel.alterar),
    },
    { id: "mesa.distribuicao", grupo: "Mesa", rotulo: "Distribuição", valor: (d) => simNao(d.mesa.distribuicao), nivel: (d) => +d.mesa.distribuicao },
    {
      id: "mesa.linhas",
      grupo: "Mesa",
      rotulo: "Linhas",
      valor: (d) => ROTULO_LINHAS[d.mesa.linhas],
      nivel: (d) => (d.mesa.linhas === "todos" ? 1 : 0),
    },
    {
      id: "mesa.desempenho",
      grupo: "Mesa",
      rotulo: "Desempenho por pessoa",
      valor: (d) => simNao(d.mesa.desempenho),
      nivel: (d) => +d.mesa.desempenho,
    },
    {
      id: "mesa.dadosPessoais",
      grupo: "Mesa",
      rotulo: "Dados pessoais",
      valor: (d) => (d.mesa.dadosPessoais === "ver" ? "Visíveis" : "Mascarados"),
      nivel: (d) => (d.mesa.dadosPessoais === "ver" ? 1 : 0),
    },
    { id: "mesa.valores", grupo: "Mesa", rotulo: "Valores (R$)", valor: (d) => simNao(d.mesa.valores, "Visíveis", "Ocultos"), nivel: (d) => +d.mesa.valores },
  ];
  for (const t of TABELAS_MESA)
    for (const c of colunasOcultaveis(t))
      out.push({
        id: `mesa.colunas.${t}.${c.chave}`,
        grupo: "Mesa",
        rotulo: `Coluna ${c.rotulo} (${ROTULO_TABELA_MESA[t]})`,
        valor: (d) => simNao(!d.mesa.colunasOcultas[t].includes(c.chave), "Visível", "Oculta"),
        nivel: (d) => +!d.mesa.colunasOcultas[t].includes(c.chave),
      });
  for (const s of SUBACOES_MESA)
    out.push({
      id: `mesa.alteracoes.${s}`,
      grupo: s === "incorporar" || s === "devolver" ? "Mesa do PCA" : "Mesa",
      rotulo: `Alterar: ${CATALOGO_SUBACOES[s].rotulo}`,
      valor: (d) => simNao(d.mesa.alteracoes[s], "Permitido", "Não"),
      nivel: (d) => +d.mesa.alteracoes[s],
    });
  for (const t of TELAS_HISTORICO)
    out.push({
      id: `historico.${t}`,
      grupo: t === "pca" ? "Mesa do PCA" : t === "tarefas" ? "Tarefas" : "Mesa",
      rotulo: "Histórico",
      valor: (d) => ROTULO_NIVEL_HISTORICO[d.historico[t]],
      nivel: (d) => ordemNivel(NIVEIS_HISTORICO, d.historico[t]),
    });
  for (const t of TELAS_EDICOES)
    for (const op of OPERACOES_EDICAO)
      out.push({
        id: `edicoes.${t}.${op}`,
        grupo: t === "pca" ? "Mesa do PCA" : t === "orcamento" ? "Orçamento" : t === "tarefas" ? "Tarefas" : "Mesa",
        rotulo: `Edições das tabelas: ${ROTULO_OPERACAO_EDICAO[op]}`,
        valor: (d) => simNao(d.edicoes[t][op], "Permitido", "Não"),
        nivel: (d) => +d.edicoes[t][op],
      });
  return out;
}
const ITENS_DETALHE = itensDetalhe();

export type DiffDetalhe = { id: string; grupo: GrupoDetalhe; rotulo: string; antes: string; depois: string; restringe: boolean };

/** O que mudou entre dois conjuntos de detalhes (na ordem do catálogo). */
export function diffDetalhes(antes: unknown, depois: unknown): DiffDetalhe[] {
  const a = coerceDetalhes(antes);
  const b = coerceDetalhes(depois);
  return ITENS_DETALHE.filter((i) => i.valor(a) !== i.valor(b)).map((i) => ({
    id: i.id,
    grupo: i.grupo,
    rotulo: i.rotulo,
    antes: i.valor(a),
    depois: i.valor(b),
    restringe: i.nivel(b) < i.nivel(a),
  }));
}

/** "Mesa: Responsável Visível → Oculto; Linhas Todos os protocolos → Só os meus" — o resumo do histórico. Vazio = nada. */
export function textoDiffDetalhes(diff: readonly DiffDetalhe[]): string {
  const porGrupo = new Map<GrupoDetalhe, string[]>();
  for (const d of diff) porGrupo.set(d.grupo, [...(porGrupo.get(d.grupo) ?? []), `${d.rotulo} ${d.antes} → ${d.depois}`]);
  return [...porGrupo].map(([g, l]) => `${g}: ${l.join("; ")}`).join(" · ");
}

/** Alguma mudança RETIRA acesso? (a tela avisa antes de gravar num papel em uso) */
export const restringeAlgo = (diff: readonly DiffDetalhe[]) => diff.some((d) => d.restringe);

export type LinhaResumoDetalhe = { grupo: GrupoDetalhe; rotulo: string; valor: string };

/** Os DESVIOS do padrão (as restrições do papel), para o resumo ("Ver acesso", Perfil, lista de papéis). Vazio = sem
 * restrições. As colunas ocultas de uma tabela saem numa linha só. */
export function resumoDetalhes(bruto: unknown): LinhaResumoDetalhe[] {
  const d = coerceDetalhes(bruto);
  const p = DETALHES_PADRAO;
  const out: LinhaResumoDetalhe[] = [];
  for (const i of ITENS_DETALHE) {
    if (i.id.startsWith("mesa.colunas.")) continue;
    if (i.valor(d) !== i.valor(p)) out.push({ grupo: i.grupo, rotulo: i.rotulo, valor: i.valor(d) });
  }
  for (const t of TABELAS_MESA) {
    const ocultas = d.mesa.colunasOcultas[t];
    if (ocultas.length)
      out.push({
        grupo: "Mesa",
        rotulo: `Colunas ocultas (${ROTULO_TABELA_MESA[t]})`,
        valor: ocultas.map((k) => CATALOGO_COLUNAS_MESA[t].find((c) => c.chave === k)?.rotulo ?? k).join(", "),
      });
  }
  return out;
}

/** Quantas restrições o papel tem (o "Detalhes (N)" do editor). */
export const contarRestricoes = (bruto: unknown) => resumoDetalhes(bruto).length;

/** Numa linha: "Sem restrições" ou "Mesa: Responsável Oculto; Linhas Só os meus · Tarefas: Histórico Sem autores". */
export function textoResumoDetalhes(bruto: unknown): string {
  const linhas = resumoDetalhes(bruto);
  if (!linhas.length) return "Sem restrições";
  const porGrupo = new Map<GrupoDetalhe, string[]>();
  for (const l of linhas) porGrupo.set(l.grupo, [...(porGrupo.get(l.grupo) ?? []), `${l.rotulo}: ${l.valor}`]);
  return [...porGrupo].map(([g, l]) => `${g} — ${l.join("; ")}`).join(" · ");
}

/** Pontos de partida do editor ("Começar de"). */
export const MODELOS_DETALHES: readonly { id: string; nome: string; descricao: string; detalhes: DetalhesPapel }[] = [
  { id: "sem", nome: "Sem restrições", descricao: "Como antes dos detalhes: vê e faz tudo o que as ações permitem.", detalhes: detalhesPadrao() },
  {
    id: "enxuta",
    nome: "Consulta enxuta",
    descricao: "Sem Responsável, Distribuição e desempenho por pessoa.",
    detalhes: coerceDetalhes({ mesa: { responsavel: { ver: false }, distribuicao: false, desempenho: false } }),
  },
  {
    id: "meus",
    nome: "Só os meus",
    descricao: "Só os protocolos em que é o Responsável ou que protocolou; assume os sem responsável.",
    detalhes: coerceDetalhes({ mesa: { linhas: "meus", responsavel: { alterar: "si" } } }),
  },
];
