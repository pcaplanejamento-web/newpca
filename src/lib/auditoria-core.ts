import type { DiffCampo, DiffItemDfd } from "./comparar-protocolo.ts";

/**
 * Núcleo PURO da auditoria (sem `getDb`/JSX) — tipos, diff de campos, rótulos de exibição e a
 * INTERPRETAÇÃO do histórico conectado (origem + detalhe estruturado). Testável no Node (como
 * `reparticao-match`/`avaliacao-core`). O acesso ao D1 (registrar/listar) fica em `auditoria.ts`.
 */

export type AcaoAuditoria =
  | "criar"
  | "editar"
  | "excluir"
  | "importar"
  | "protocolar"
  | "login"
  | "logout"
  | "cadastro"
  | "aprovar";

export type EntidadeAuditoria =
  | "dfd"
  | "dfd_item"
  | "protocolo"
  | "catalogo"
  | "catalogo_item"
  | "pca"
  | "grupo"
  | "permissao"
  | "orgao"
  | "reparticao"
  | "usuario"
  | "configuracao"
  | "planilha"
  | "protocolo_legado"
  | "orcamento"
  | "situacao_protocolo"
  | "sessao";

/** Verbo (no passado) de cada ação — para a linha do histórico. */
export const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  criar: "Criou",
  editar: "Editou",
  excluir: "Excluiu",
  importar: "Importou",
  protocolar: "Protocolou",
  login: "Entrou",
  logout: "Saiu",
  cadastro: "Cadastrou-se",
  aprovar: "Aprovou",
};

/** Nome legível de cada entidade. */
export const ROTULO_ENTIDADE: Record<EntidadeAuditoria, string> = {
  dfd: "DFD",
  dfd_item: "Item do DFD",
  protocolo: "Protocolo",
  catalogo: "Catálogo",
  catalogo_item: "Item do catálogo",
  pca: "PCA",
  grupo: "Grupo",
  permissao: "Permissão",
  orgao: "Órgão",
  reparticao: "Unidade",
  usuario: "Usuário",
  configuracao: "Configuração",
  planilha: "Planilha (PCA)",
  protocolo_legado: "Protocolo (legado)",
  orcamento: "Orçamento",
  situacao_protocolo: "Situação de protocolo",
  sessao: "Sessão",
};

/** Ator do log — só id/nome/email (aceita `null` para sistema/anônimo). */
export type Ator = { id: number; nome: string; email: string } | null;

/** Valor formatado para o resumo do diff. */
function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Diff de `campos` entre `antes` e `depois` — devolve só os que mudaram + um `resumo`
 * legível ("Rótulo: de → para; ..."). Puro. Usado nas edições para o log.
 */
export function diffCampos<T extends Record<string, unknown>>(
  antes: Partial<T> | null | undefined,
  depois: Partial<T> | null | undefined,
  campos: readonly (keyof T)[],
  rotulos?: Partial<Record<keyof T, string>>,
): { antes: Record<string, unknown>; depois: Record<string, unknown>; resumo: string; mudou: boolean } {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  const partes: string[] = [];
  for (const c of campos) {
    const va = antes?.[c] ?? null;
    const vd = depois?.[c] ?? null;
    if (JSON.stringify(va) !== JSON.stringify(vd)) {
      a[String(c)] = va;
      d[String(c)] = vd;
      partes.push(`${rotulos?.[c] ?? String(c)}: ${fmtVal(va)} → ${fmtVal(vd)}`);
    }
  }
  return { antes: a, depois: d, resumo: partes.join("; "), mudou: partes.length > 0 };
}

// ---------------------------------------------------------------------------------------------------
// HISTÓRICO CONECTADO (protocolo › DFD › item) — ORIGEM + DETALHE ESTRUTURADO de cada alteração
// ---------------------------------------------------------------------------------------------------

/** Por onde a alteração passou (o "canal") — gravado na coluna `origem`. */
export type OrigemAuditoria =
  | "protocolacao" // protocolação do PDF do protocolo (DFDs gravados/sobrescritos por ela)
  | "reenvio" // reenvio do PDF corrigido (sobrescrita com comparação)
  | "avulso" // DFD avulso importado
  | "banner" // edição no banner (protocolo/DFD gravado — "Salvar alterações")
  | "massa" // edição em massa na Mesa
  | "celula" // dropdown na tabela da Mesa (responsável/situação)
  | "vinculo" // vincular/desvincular um DFD a um protocolo
  | "exclusao";

export const ROTULO_ORIGEM: Record<OrigemAuditoria, string> = {
  protocolacao: "Protocolação",
  reenvio: "Reenvio do protocolo",
  avulso: "Importação avulsa",
  banner: "Edição no banner",
  massa: "Edição em massa",
  celula: "Tabela da Mesa",
  vinculo: "Vínculo com protocolo",
  exclusao: "Exclusão",
};

/**
 * DETALHE estruturado de uma alteração (coluna `detalhe`, JSON): o documento alvo (sobrevive à
 * exclusão), os campos, as seções, as assinaturas e os ITENS alterados — antes → depois, com os valores
 * JÁ FORMATADOS para exibir (mesmo formato da comparação do reenvio: `DiffCampo`/`DiffItemDfd`).
 */
export type DetalheAuditoria = {
  alvo?: { numero: string; planejamento?: string | null } | null;
  campos?: DiffCampo[];
  secoes?: DiffCampo[];
  assinaturas?: DiffCampo | null;
  itens?: DiffItemDfd[];
  obs?: string[];
};

/** Teto de cada texto (seções longas) e de itens por linha de auditoria — o log fica leve. */
const MAX_TEXTO = 1500;
const MAX_ITENS = 400;
const corta = (t: string) => (t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO - 1)}…` : t);
const cortaCampo = (d: DiffCampo): DiffCampo => ({ ...d, antes: corta(d.antes), depois: corta(d.depois) });

/** Detalhe a partir de uma comparação (`compararDfd`/`compararCapa`) — limita tamanhos. `null` = nada. */
export function detalheDe(d: DetalheAuditoria): DetalheAuditoria | null {
  const itens = d.itens ?? [];
  const obs = [...(d.obs ?? [])];
  if (itens.length > MAX_ITENS) obs.push(`… e mais ${itens.length - MAX_ITENS} item(ns) alterado(s).`);
  const out: DetalheAuditoria = {
    ...(d.alvo ? { alvo: d.alvo } : {}),
    ...(d.campos?.length ? { campos: d.campos.map(cortaCampo) } : {}),
    ...(d.secoes?.length ? { secoes: d.secoes.map(cortaCampo) } : {}),
    ...(d.assinaturas ? { assinaturas: cortaCampo(d.assinaturas) } : {}),
    ...(itens.length ? { itens: itens.slice(0, MAX_ITENS).map((it) => ({ ...it, campos: it.campos.map(cortaCampo) })) } : {}),
    ...(obs.length ? { obs } : {}),
  };
  return Object.keys(out).length > 0 ? out : null;
}

/** Linha de auditoria como a consulta do histórico devolve (o que a interpretação lê). */
export type LinhaHistorico = {
  id: number;
  usuarioId: number | null;
  usuarioNome: string | null;
  acao: string;
  entidade: string;
  entidadeId: number | null;
  resumo: string | null;
  antes: string | null;
  depois: string | null;
  origem: string | null;
  detalhe: string | null;
  protocoloId: number | null;
  protocoloNumero: string | null;
  criadoEm: string | null;
};

/** Uma alteração INTERPRETADA (formato novo `detalhe` OU o legado `antes`/`depois`/`resumo`). */
export type AlteracaoHistorico = {
  alvo: { numero: string; planejamento: string | null } | null;
  campos: DiffCampo[];
  secoes: DiffCampo[];
  assinaturas: DiffCampo | null;
  itens: DiffItemDfd[];
  obs: string[];
};

/** Rótulo legível dos campos gravados no legado (`antes`/`depois` por chave). */
export const ROTULO_CAMPO: Record<string, string> = {
  reparticaoId: "Unidade",
  interessado: "Interessado",
  documento: "CPF/CNPJ",
  assunto: "Assunto",
  observacao: "Observação",
  valorCapa: "Valor da capa",
  localReparticao: "Local",
  responsavelId: "Responsável",
  situacaoId: "Situação",
  anoPca: "PCA (ano)",
  tipo: "Tipo",
  numeroContrato: "Nº do contrato",
  numeroAta: "Nº da ARP",
  numeroLicitacao: "Nº da licitação",
  objeto: "Objeto",
  orgaoEntidade: "Órgão/Entidade",
  setorRequisitante: "Setor requisitante",
  responsavel: "Responsável (DFD)",
  matricula: "Matrícula",
  email: "E-mail",
  telefone: "Telefone",
  codigo: "Código",
  descricao: "Descrição",
  unidade: "Unidade de medida",
  quantidade: "Quantidade",
  valorUnitario: "Valor unitário",
  valorTotal: "Valor total",
  totalItens: "Itens",
  numero: "Número",
  nome: "Nome",
  sigla: "Sigla",
  cor: "Cor",
};
const MOEDA = new Set(["valorCapa", "valorUnitario", "valorTotal"]);
const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Valor legado → texto de exibição (R$ nos campos de valor; id de unidade vira "#id"). */
function fmtCampo(k: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number" && MOEDA.has(k)) return reais(v);
  if (typeof v === "number" && k.endsWith("Id")) return `#${v}`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function objeto(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
const lista = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
const numOuNulo = (v: unknown) => (typeof v === "number" ? v : v == null || v === "" ? null : Number(v) || null);
const txtOuNulo = (v: unknown) => (v == null || v === "" ? null : String(v));

/** Itens do legado da MASSA (`antes.itens` × `depois.itens`, pareados pela posição). */
function itensLegadoMassa(antes: Record<string, unknown>, depois: Record<string, unknown>): DiffItemDfd[] {
  const a = lista(antes.itens);
  const d = lista(depois.itens);
  return a.map((x, i) => {
    const y = d[i] ?? {};
    const base = { item: numOuNulo(x.item), codigo: txtOuNulo(x.codigo), descricao: txtOuNulo(x.descricao) };
    if (y.removido === true) return { tipo: "removido" as const, ...base, campos: [] };
    const campos = Object.keys(y)
      .filter((k) => !["item", "codigo", "removido"].includes(k))
      .map((k) => ({ campo: k, rotulo: ROTULO_CAMPO[k] ?? k, antes: fmtCampo(k, x[k]), depois: fmtCampo(k, y[k]) }));
    return { tipo: "alterado" as const, ...base, campos };
  });
}

/** Itens do legado do "Salvar alterações" (só no `resumo`: "Item 3: quantidade: 20 → 35; … · Item 5: …"). */
function itensLegadoResumo(resumo: string): DiffItemDfd[] {
  const out: DiffItemDfd[] = [];
  for (const m of resumo.matchAll(/Item (\d+): (.*?)(?= · Item \d+: |$)/g)) {
    const campos = m[2]
      .split("; ")
      .map((parte): DiffCampo | null => {
        if (/^descrição alterada$/i.test(parte.trim())) return { campo: "descricao", rotulo: "Descrição", antes: "—", depois: "alterada" };
        const c = parte.match(/^(.*?): (.*) → (.*)$/);
        return c ? { campo: c[1], rotulo: c[1].charAt(0).toUpperCase() + c[1].slice(1), antes: c[2], depois: c[3] } : null;
      })
      .filter((c): c is DiffCampo => c != null);
    if (campos.length > 0) out.push({ tipo: "alterado", item: Number(m[1]), codigo: null, descricao: null, campos });
  }
  return out;
}

/** O nº do DFD citado no resumo legado ("DFD 1234: …"). */
const alvoDoResumo = (resumo: string | null) => {
  const m = String(resumo ?? "").match(/^DFD ([^:\s]+)/);
  return m ? { numero: m[1], planejamento: null } : null;
};

/**
 * Interpreta UMA linha do histórico: o formato novo (`detalhe` estruturado) ou o LEGADO (`antes`/`depois`
 * por chave; itens da massa em `antes.itens`/`depois.itens`; itens do "Salvar" só no `resumo`). Puro.
 */
export function interpretarAlteracao(l: Pick<LinhaHistorico, "detalhe" | "antes" | "depois" | "resumo" | "entidade">): AlteracaoHistorico {
  const vazio: AlteracaoHistorico = { alvo: null, campos: [], secoes: [], assinaturas: null, itens: [], obs: [] };
  const det = objeto(l.detalhe);
  if (Object.keys(det).length > 0) {
    const alvo = det.alvo && typeof det.alvo === "object" ? (det.alvo as { numero?: unknown; planejamento?: unknown }) : null;
    return {
      alvo: alvo?.numero ? { numero: String(alvo.numero), planejamento: txtOuNulo(alvo.planejamento) } : null,
      campos: lista(det.campos) as unknown as DiffCampo[],
      secoes: lista(det.secoes) as unknown as DiffCampo[],
      assinaturas: det.assinaturas && typeof det.assinaturas === "object" ? (det.assinaturas as DiffCampo) : null,
      itens: lista(det.itens).map((it) => ({
        tipo: it.tipo === "novo" || it.tipo === "removido" ? it.tipo : "alterado",
        item: numOuNulo(it.item),
        codigo: txtOuNulo(it.codigo),
        descricao: txtOuNulo(it.descricao),
        campos: lista(it.campos) as unknown as DiffCampo[],
      })),
      obs: Array.isArray(det.obs) ? det.obs.map(String) : [],
    };
  }
  const antes = objeto(l.antes);
  const depois = objeto(l.depois);
  const itens = Array.isArray(antes.itens) ? itensLegadoMassa(antes, depois) : l.entidade === "dfd" ? itensLegadoResumo(String(l.resumo ?? "")) : [];
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => k !== "itens" && k !== "itensAlterados");
  const campos = chaves.map((k) => ({ campo: k, rotulo: ROTULO_CAMPO[k] ?? k, antes: fmtCampo(k, antes[k]), depois: fmtCampo(k, depois[k]) }));
  return { ...vazio, alvo: l.entidade === "dfd" ? alvoDoResumo(l.resumo) : null, campos, itens };
}

/** A alteração de UM item dentro de uma alteração do DFD (pelo nº do item; sem nº, pelo código). */
export function alteracaoDoItem(a: AlteracaoHistorico, alvo: { item: number | null; codigo: string | null }): DiffItemDfd | null {
  const cod = (v: string | null) => String(v ?? "").replace(/\D/g, "");
  return (
    a.itens.find((it) => alvo.item != null && it.item === alvo.item) ??
    a.itens.find((it) => alvo.item == null && !!cod(alvo.codigo) && cod(it.codigo) === cod(alvo.codigo)) ??
    null
  );
}

/** Quanto mudou numa alteração (o total conta cada campo, seção, assinatura e item). */
export function contarAlteracao(a: AlteracaoHistorico): {
  total: number;
  itens: Record<DiffItemDfd["tipo"], number>;
} {
  const itens = { novo: 0, removido: 0, alterado: 0 };
  for (const it of a.itens) itens[it.tipo]++;
  return { total: a.campos.length + a.secoes.length + (a.assinaturas ? 1 : 0) + a.itens.length, itens };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O QUE mudou, numa frase curta — "Assunto, Valor da capa · 1 seção · 3 itens (1 novo, 2 alterados)".
 * Vazio quando a linha não tem detalhe estruturado (o chamador mostra o `resumo`).
 */
export function resumoCurtoAlteracao(a: AlteracaoHistorico, maxRotulos = 3): string {
  const partes: string[] = [];
  if (a.campos.length > 0) {
    const rot = a.campos.slice(0, maxRotulos).map((c) => c.rotulo);
    partes.push(`${rot.join(", ")}${a.campos.length > maxRotulos ? ` +${a.campos.length - maxRotulos}` : ""}`);
  }
  if (a.secoes.length > 0) partes.push(plural(a.secoes.length, "seção", "seções"));
  if (a.assinaturas) partes.push("assinaturas");
  if (a.itens.length > 0) {
    const { itens } = contarAlteracao(a);
    const tipos = (["novo", "removido", "alterado"] as const).filter((t) => itens[t] > 0);
    const rotulo = { novo: ["novo", "novos"], removido: ["removido", "removidos"], alterado: ["alterado", "alterados"] } as const;
    partes.push(
      tipos.length === 1
        ? `${plural(a.itens.length, "item", "itens")} ${rotulo[tipos[0]][a.itens.length === 1 ? 0 : 1]}`
        : `${plural(a.itens.length, "item", "itens")} (${tipos.map((t) => `${itens[t]} ${rotulo[t][itens[t] === 1 ? 0 : 1]}`).join(", ")})`,
    );
  }
  return partes.join(" · ");
}

/** O documento ALVO de uma linha: "DFD 1525 · Planej. 1549", "Protocolo 2026/000321", "Unidade #4"… */
export function rotuloAlvo(
  l: Pick<LinhaHistorico, "entidade" | "entidadeId" | "resumo" | "protocoloId" | "protocoloNumero">,
  a: Pick<AlteracaoHistorico, "alvo">,
): string {
  if (l.entidade === "dfd") {
    if (!a.alvo) return `DFD #${l.entidadeId ?? "—"}`;
    return `DFD ${a.alvo.numero}${a.alvo.planejamento ? ` · Planej. ${a.alvo.planejamento}` : ""}`;
  }
  if (l.entidade === "protocolo") {
    // Nº ATUAL (junção pelo protocolo da linha) ou o citado no resumo (legado/excluído).
    const doResumo = String(l.resumo ?? "").match(/^Protocolo (\S+?)(?::|\s|$)/)?.[1];
    const numero = l.protocoloId != null && l.protocoloId === l.entidadeId && l.protocoloNumero ? l.protocoloNumero : doResumo;
    return `Protocolo ${numero ?? `#${l.entidadeId ?? "—"}`}`;
  }
  const nome = ROTULO_ENTIDADE[l.entidade as EntidadeAuditoria] ?? l.entidade;
  return l.entidadeId != null ? `${nome} #${l.entidadeId}` : nome;
}

/** Filtro do histórico do PROTOCOLO: tudo · a capa/gestão · os DFDs · só as alterações de itens. */
export type FiltroHistorico = "tudo" | "capa" | "dfds" | "itens";
export const ROTULO_FILTRO_HISTORICO: Record<FiltroHistorico, string> = { tudo: "Tudo", capa: "Capa", dfds: "DFDs", itens: "Itens" };

export function passaFiltroHistorico(l: Pick<LinhaHistorico, "entidade">, a: Pick<AlteracaoHistorico, "itens">, f: FiltroHistorico): boolean {
  if (f === "tudo") return true;
  if (f === "capa") return l.entidade === "protocolo";
  if (f === "dfds") return l.entidade === "dfd";
  return l.entidade === "dfd" && a.itens.length > 0;
}

/** Uma entrada do histórico de UM item: a alteração que o cita (`item`) ou a importação do DFD (`null`). */
export type EntradaHistoricoItem<T> = { linha: T; alteracao: AlteracaoHistorico; item: DiffItemDfd | null };

/**
 * Histórico de UM ITEM a partir do histórico do DFD (mais recente primeiro): as alterações que o citam
 * (novo/removido/alterado, campo a campo) + a IMPORTAÇÃO do DFD por onde o item entrou — e, quando a
 * importação não registrou o detalhe por item (legado ou itens em vários lotes), a regravação. Uma
 * sobrescrita que não mexeu no item não aparece. Puro.
 */
export function historicoDoItem<T extends LinhaHistorico>(linhas: T[], alvo: { item: number | null; codigo: string | null }): EntradaHistoricoItem<T>[] {
  const out: EntradaHistoricoItem<T>[] = [];
  for (const linha of linhas) {
    if (linha.entidade !== "dfd") continue;
    const alteracao = interpretarAlteracao(linha);
    const item = alteracaoDoItem(alteracao, alvo);
    if (item) out.push({ linha, alteracao, item });
    else if (
      linha.acao === "importar" &&
      (linha.detalhe == null || linha.depois != null || alteracao.obs.some((o) => /sem o detalhe por item/i.test(o)))
    )
      out.push({ linha, alteracao, item: null });
  }
  return out;
}

/** Instante (ms) de uma linha — `CURRENT_TIMESTAMP` do SQLite é UTC sem fuso. */
export const instanteDe = (iso: string | null) => (iso ? Date.parse(`${iso.replace(" ", "T")}Z`) : Number.NaN);

/**
 * Agrupa linhas CONSECUTIVAS (mais recente primeiro) do mesmo usuário + origem + protocolo feitas em até
 * `janelaSeg` segundos — um "Salvar alterações" do banner (capa + vários DFDs), um reenvio ou uma edição
 * em massa viram UM evento no histórico do protocolo. Puro.
 */
export function agruparHistorico<T extends Pick<LinhaHistorico, "usuarioId" | "origem" | "protocoloId" | "criadoEm">>(
  linhas: T[],
  janelaSeg = 120,
): T[][] {
  const grupos: T[][] = [];
  for (const l of linhas) {
    const g = grupos[grupos.length - 1];
    const ult = g?.[g.length - 1];
    const perto = ult && Math.abs(instanteDe(ult.criadoEm) - instanteDe(l.criadoEm)) <= janelaSeg * 1000;
    if (g && ult && perto && l.origem != null && ult.origem === l.origem && ult.usuarioId === l.usuarioId && ult.protocoloId === l.protocoloId) g.push(l);
    else grupos.push([l]);
  }
  return grupos;
}
