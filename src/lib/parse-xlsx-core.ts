import { type LinhaNormalizada, normalizarLinha, stripAccents } from "./normalize.ts";

/**
 * Núcleo PURO da leitura das planilhas do PCA de lista pronta (a matriz de células → as planilhas). Dois formatos:
 * - **por unidade** (o de sempre): "Código"/"Município" acima do cabeçalho (Id Produto · Nome do Produto · …) — UMA planilha;
 * - **consolidado** ("Enviar_PCA"): uma linha por item com a coluna **LOCAL** (a sigla da unidade) — UMA planilha por LOCAL,
 *   com Domínio, Prioridade e o ID PROTOCOLO (o "Id:" da capa — a chave da união com os protocolos incorporados ao PCA).
 * Nada é descartado em silêncio: o que sai ou merece atenção vai em `problemas` (a prévia da Importação).
 */

export type LinhaCruaUpload = {
  idProduto: string | number | null;
  sequencial: string | number | null;
  nomeProduto: string | null;
  unidadeMedida: string | null;
  quantidade: string | number | null;
  valorReferencia: string | number | null;
  classificacao: string | null;
  dataDesejada: string | null;
  dominio?: string | null;
  prioridade?: string | null;
  protocoloIdExterno?: string | null;
};

export type PlanilhaParseada = {
  codigo: string;
  municipio: string;
  nomeArquivo: string;
  rows: LinhaCruaUpload[];
};

/** Um apontamento da prévia: o tipo, quantas ocorrências e até 5 exemplos (linha da planilha · texto). */
export type ProblemaPlanilha = { tipo: string; quantidade: number; exemplos: string[] };

export type LeituraPlanilhas = {
  formato: "unidade" | "consolidado";
  planilhas: PlanilhaParseada[];
  problemas: ProblemaPlanilha[];
};

type Campo = keyof LinhaCruaUpload | "local";

const HEADER_MAP: Record<string, Campo> = {
  "ID PRODUTO": "idProduto",
  SEQUENCIAL: "sequencial",
  "NOME DO PRODUTO": "nomeProduto",
  "NOME PRODUTO": "nomeProduto",
  "UNIDADE MEDIDA": "unidadeMedida",
  "UNIDADE DE MEDIDA": "unidadeMedida",
  QUANTIDADE: "quantidade",
  QTD: "quantidade",
  "VALOR REFERENCIA": "valorReferencia",
  "VALOR DE REFERENCIA": "valorReferencia",
  "VALOR REFERENCIAL": "valorReferencia",
  CLASSIFICACAO: "classificacao",
  "DATA DESEJADA": "dataDesejada",
  // Planilha consolidada ("Enviar_PCA").
  LOCAL: "local",
  CODIGO: "idProduto",
  PRODUTO: "nomeProduto",
  "UNIDADES (DIVERSOS) DE MEDIDA": "unidadeMedida",
  "VALOR UNITARIO": "valorReferencia",
  "DATA PARA CONTRATACAO": "dataDesejada",
  DOMINIO: "dominio",
  PRIORIDADE: "prioridade",
  "ID PROTOCOLO": "protocoloIdExterno",
};

const MUNICIPIO_PADRAO = "MUNICÍPIO NÃO INFORMADO";

export function chaveCabecalho(v: unknown): string {
  return stripAccents(
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  );
}

function texto(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : dataIso(v);
  return String(v).trim() || null;
}

function cru(v: unknown): string | number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : dataIso(v);
  return String(v).trim() || null;
}

/** A data da célula pelo DIA do calendário (o meio-dia evita o fuso empurrar para o dia anterior). */
function dataIso(d: Date): string {
  const m = new Date(d.getTime() + 12 * 3600e3);
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}-${String(m.getUTCDate()).padStart(2, "0")}`;
}

/** Código do produto: só os dígitos quando houver ("122184-FEMBOM" → "122184", " 5241939987" → "5241939987"). */
function codigoProduto(v: unknown): { codigo: string | number | null; comTexto: boolean } {
  const c = cru(v);
  if (c == null || typeof c === "number") return { codigo: c, comTexto: false };
  const dig = c.replace(/\D/g, "");
  if (!dig) return { codigo: c, comTexto: false };
  return { codigo: dig, comTexto: dig !== c };
}

class Apontamentos {
  private m = new Map<string, ProblemaPlanilha>();
  add(tipo: string, exemplo: string) {
    const p = this.m.get(tipo) ?? { tipo, quantidade: 0, exemplos: [] };
    p.quantidade += 1;
    if (p.exemplos.length < 5) p.exemplos.push(exemplo);
    this.m.set(tipo, p);
  }
  lista() {
    return [...this.m.values()];
  }
}

/** Lê a matriz de UMA aba (linhas × células, como o SheetJS devolve com `header:1`). Lança com a mensagem para a tela. */
export function lerPlanilhas(aoa: unknown[][], nomeArquivo: string): LeituraPlanilhas {
  let codigo = "";
  let municipio = "";
  let headerRow = -1;
  const colMap = new Map<number, Campo>();

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const a = chaveCabecalho(row[0]);
    if (a === "CODIGO" && row[1] != null && row.filter((c) => c != null && c !== "").length <= 3) codigo = String(row[1]).trim();
    if (a === "MUNICIPIO" && row[1] != null) municipio = String(row[1]).trim();
    if (row.filter((c) => HEADER_MAP[chaveCabecalho(c)]).length >= 4) {
      headerRow = r;
      row.forEach((c, i) => {
        const campo = HEADER_MAP[chaveCabecalho(c)];
        if (campo && ![...colMap.values()].includes(campo)) colMap.set(i, campo);
      });
      break;
    }
  }

  if (headerRow < 0) {
    throw new Error(
      "Não encontrei o cabeçalho da planilha (Id Produto/Código, Nome do Produto/Produto, Quantidade, Valor…). Confira se é a planilha do PCA.",
    );
  }
  const consolidado = [...colMap.values()].includes("local");
  if (!consolidado && !codigo) throw new Error("Não encontrei o “Código” da unidade no cabeçalho da planilha.");

  const problemas = new Apontamentos();
  const porLocal = new Map<string, LinhaCruaUpload[]>();
  const repetidos = new Map<string, number>();
  const porProtocolo = new Map<string, { prioridades: Set<string>; datas: Set<string>; locais: Set<string> }>();
  let vazias = 0;

  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const o: Partial<Record<Campo, unknown>> = {};
    for (const [i, campo] of colMap) o[campo] = row[i];
    const linha = `Linha ${r + 1}`;
    const nome = texto(o.nomeProduto);
    const { codigo: idProduto, comTexto } = codigoProduto(o.idProduto);
    if (!nome && idProduto == null) {
      if (row.some((c) => c != null && c !== "")) problemas.add("Linha sem código e sem produto (ignorada)", linha);
      else vazias += 1;
      continue;
    }
    const item: LinhaCruaUpload = {
      idProduto,
      sequencial: cru(o.sequencial),
      nomeProduto: nome,
      unidadeMedida: texto(o.unidadeMedida),
      quantidade: cru(o.quantidade),
      valorReferencia: cru(o.valorReferencia),
      classificacao: texto(o.classificacao),
      dataDesejada: texto(o.dataDesejada),
    };
    if (idProduto == null) problemas.add("Item sem código", `${linha} · ${nome ?? ""}`.slice(0, 120));
    if (comTexto) problemas.add("Código com texto (ficaram só os números)", `${linha} · ${String(o.idProduto).trim()}`);
    let local = codigo;
    if (consolidado) {
      local = (texto(o.local) ?? "").toUpperCase();
      item.dominio = texto(o.dominio);
      item.prioridade = texto(o.prioridade);
      item.protocoloIdExterno = texto(o.protocoloIdExterno);
      if (!local) {
        problemas.add("Item sem LOCAL (ignorado)", `${linha} · ${nome ?? ""}`.slice(0, 120));
        continue;
      }
      if (!item.dominio) problemas.add("Item sem domínio", linha);
      if (!item.prioridade) problemas.add("Item sem prioridade", linha);
      const pid = item.protocoloIdExterno?.replace(/\D/g, "");
      if (pid) {
        const p = porProtocolo.get(pid) ?? { prioridades: new Set(), datas: new Set(), locais: new Set() };
        if (item.prioridade) p.prioridades.add(chaveCabecalho(item.prioridade));
        if (item.dataDesejada) p.datas.add(item.dataDesejada);
        p.locais.add(local);
        porProtocolo.set(pid, p);
      }
    }
    if (!(Number(item.quantidade) > 0)) problemas.add("Item sem quantidade", linha);
    if (!(Number(item.valorReferencia) > 0)) problemas.add("Item sem valor unitário", linha);
    const chave = `${local}|${idProduto ?? ""}|${chaveCabecalho(nome)}|${chaveCabecalho(item.unidadeMedida)}`;
    const vezes = (repetidos.get(chave) ?? 0) + 1;
    repetidos.set(chave, vezes);
    if (vezes === 2) problemas.add("Item repetido na mesma unidade (mesmo código, produto e unidade de medida)", `${local} · ${idProduto ?? ""} · ${nome ?? ""}`.slice(0, 120));
    const l = porLocal.get(local);
    if (l) l.push(item);
    else porLocal.set(local, [item]);
  }
  if (vazias) problemas.add("Linhas vazias (ignoradas)", `${vazias} linha(s)`);
  for (const [pid, p] of porProtocolo) {
    if (p.locais.size > 1) problemas.add("Protocolo em mais de uma unidade", `Id ${pid} · ${[...p.locais].join(", ")}`);
    if (p.prioridades.size > 1) problemas.add("Prioridades diferentes no mesmo protocolo", `Id ${pid}`);
    if (p.datas.size > 1) problemas.add("Datas para contratação diferentes no mesmo protocolo", `Id ${pid}`);
  }
  // Os repetidos contam UMA vez por grupo; o "vezes === 2" já registrou.

  const planilhas = [...porLocal].map(([local, rows]) => ({
    codigo: local,
    municipio: municipio || MUNICIPIO_PADRAO,
    nomeArquivo: consolidado ? `${nomeArquivo} · ${local}` : nomeArquivo,
    rows,
  }));
  if (planilhas.length === 0) throw new Error("Encontrei o cabeçalho, mas nenhuma linha de item preenchida.");
  planilhas.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR"));
  return { formato: consolidado ? "consolidado" : "unidade", planilhas, problemas: problemas.lista() };
}

/** Uma linha da PRÉVIA da importação: a unidade (LOCAL) + o item como será gravado. */
export type LinhaPrevia = LinhaNormalizada & { unidade: string; indice: number };

/** Achata a leitura nas linhas que serão gravadas (a MESMA régua do servidor — `normalizarLinha`). */
export function linhasDaPrevia(leitura: LeituraPlanilhas): LinhaPrevia[] {
  const out: LinhaPrevia[] = [];
  for (const p of leitura.planilhas) for (const r of p.rows) out.push({ ...normalizarLinha(r), unidade: p.codigo, indice: out.length });
  return out;
}
