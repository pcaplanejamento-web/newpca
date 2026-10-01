import { coeficienteVariacao, nivelVariacao } from "./itens-consolidados.ts";
import { norm } from "./parse-dfd-comum.ts";

/**
 * Núcleo PURO do CATÁLOGO por TIPO + o HISTÓRICO DE COMPRA (migração `0075`). Sem `getDb`/JSX — testável no Node.
 *
 * - **Tipos de catálogo:** `agenda` (Catálogo da Agenda — itens com código ÚNICO GLOBAL, a referência de padronização) e
 *   `historico` (Histórico de compra — os contratos e itens comprados, exportados do sistema de compras).
 * - **Leitura do arquivo do histórico** (CSV `;` do sistema de compras, ou a mesma planilha em .xlsx): colunas achadas pelo
 *   NOME do cabeçalho (qualquer ordem), o "$$" do export volta a ser vírgula, números "10.0000"/"1.234,56", datas
 *   dd/mm/aaaa → AAAA-MM-DD, o código só com dígitos; linhas IDÊNTICAS repetidas pelo export saem (contadas).
 * - **Análise:** `produtosDoHistorico` (um por código: o VALOR ATUAL em cada contrato — `valorAtualNoContrato`, base +
 *   aditivo —, o valor atual do produto = o do contrato assinado por último, e menor/médio/maior/variação ENTRE contratos)
 *   e `resumoHistorico` (os números do topo).
 */

// ---------------------------------------------------------------- Tipos de catálogo

export const TIPOS_CATALOGO = ["agenda", "historico"] as const;
export type TipoCatalogo = (typeof TIPOS_CATALOGO)[number];
export const ROTULO_TIPO_CATALOGO: Record<TipoCatalogo, string> = { agenda: "Catálogo da Agenda", historico: "Histórico de compra" };
/** A cor da capa quando o catálogo não tem uma escolhida. */
export const COR_PADRAO_CATALOGO: Record<TipoCatalogo, string> = { agenda: "#2563EB", historico: "#059669" };

export function tipoCatalogo(v: string | null | undefined): TipoCatalogo {
  return v === "historico" ? "historico" : "agenda";
}

/** A cor da capa do catálogo: a escolhida (hex válido) ou a do tipo. */
export function corDoCatalogo(cor: string | null | undefined, tipo: TipoCatalogo): string {
  return cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : COR_PADRAO_CATALOGO[tipo];
}

// ---------------------------------------------------------------- Modelo

export type ContratoHistorico = {
  idContrato: string;
  numeroContrato: string | null;
  idLicitacao: string | null;
  numeroLicitacao: string | null;
  orgao: string | null;
  unidadeGestora: string | null;
  credor: string | null;
  valorContrato: number | null;
  dataAssinatura: string | null; // AAAA-MM-DD
  dataPublicacao: string | null;
  modalidade: string | null;
  protocolo: string | null;
  objeto: string | null;
  natureza: string | null;
  detalhamento: string | null;
};

export type CompraHistorico = {
  ordem: number;
  idContrato: string;
  processo: string | null;
  codigo: string;
  sequencial: number | null;
  descricao: string;
  qtdContratada: number | null;
  qtdAditada: number | null;
  qtdEmpenhada: number | null;
  qtdOfEmpenhar: number | null;
  saldoEmpenhar: number | null;
  valorUnitario: number | null;
  valorContratado: number | null;
  valorEmpenhado: number | null;
  saldoValorEmpenhar: number | null;
  qtdLiquidada: number | null;
  qtdLiquidadaAnulada: number | null;
  qtdEmpenhadaAnulada: number | null;
  saldoLiquidar: number | null;
};

type CampoContrato = Exclude<keyof ContratoHistorico, "idContrato">;
type CampoCompra = Exclude<keyof CompraHistorico, "ordem" | "idContrato">;
type Campo = "idContrato" | CampoContrato | CampoCompra;

/** O cabeçalho do arquivo (normalizado — `norm`: maiúsculas, sem acento) → o campo. */
const CABECALHO: Record<string, Campo> = {
  "ID LICITACAO": "idLicitacao",
  ORGAO: "orgao",
  "NUMERO LICITACAO": "numeroLicitacao",
  "PROCESSO DE COMPRAS": "processo",
  "ID CONTRATO": "idContrato",
  "NUMERO CONTRATO": "numeroContrato",
  CREDOR: "credor",
  "UNIDADE GESTORA": "unidadeGestora",
  "VALOR CONTRATO": "valorContrato",
  "DATA ASSINATURA": "dataAssinatura",
  "DATA PUBLICACAO": "dataPublicacao",
  "MODALIDADE LICITACAO": "modalidade",
  PROTOCOLO: "protocolo",
  OBJETO: "objeto",
  "ID PRODUTO": "codigo",
  SEQUENCIAL: "sequencial",
  "DESCRICAO PRODUTO": "descricao",
  "QUANTIDADE CONTRATADA": "qtdContratada",
  "QUANTIDADE ADITADA": "qtdAditada",
  "QUANTIDADE EMPENHADA": "qtdEmpenhada",
  "QUANT. OF EMPENHAR": "qtdOfEmpenhar",
  "QUANT OF EMPENHAR": "qtdOfEmpenhar",
  "SALDO A EMPENHAR": "saldoEmpenhar",
  "VALOR UNITARIO": "valorUnitario",
  "VALOR CONTRATADO": "valorContratado",
  "VALOR EMPENHADO": "valorEmpenhado",
  "SALDO VALOR A EMPENHAR": "saldoValorEmpenhar",
  "QTD. LIQUIDADO": "qtdLiquidada",
  "QTD LIQUIDADO": "qtdLiquidada",
  "QTD. LIQUIDADO ANULADO": "qtdLiquidadaAnulada",
  "QTD LIQUIDADO ANULADO": "qtdLiquidadaAnulada",
  "QTD. EMPENHADO ANULADO": "qtdEmpenhadaAnulada",
  "QTD EMPENHADO ANULADO": "qtdEmpenhadaAnulada",
  "SALDO LIQUIDAR": "saldoLiquidar",
  "NATUREZA OBJETO": "natureza",
  "DETALHAMENTO NATUREZA OBJETO": "detalhamento",
};

/** As colunas sem as quais o arquivo não é um histórico de compra. */
export const COLUNAS_OBRIGATORIAS: { campo: Campo; rotulo: string }[] = [
  { campo: "idContrato", rotulo: "Id Contrato" },
  { campo: "codigo", rotulo: "Id Produto" },
  { campo: "descricao", rotulo: "Descricao Produto" },
  { campo: "valorUnitario", rotulo: "Valor Unitário" },
];

const NUMERICOS = new Set<Campo>([
  "valorContrato",
  "qtdContratada",
  "qtdAditada",
  "qtdEmpenhada",
  "qtdOfEmpenhar",
  "saldoEmpenhar",
  "valorUnitario",
  "valorContratado",
  "valorEmpenhado",
  "saldoValorEmpenhar",
  "qtdLiquidada",
  "qtdLiquidadaAnulada",
  "qtdEmpenhadaAnulada",
  "saldoLiquidar",
]);
const DATAS = new Set<Campo>(["dataAssinatura", "dataPublicacao"]);

/** O tamanho máximo de cada TEXTO (a MESMA régua do Zod — o arquivo nunca é recusado por um texto longo: corta). */
export const LIMITES_HISTORICO = {
  idContrato: 40,
  numeroContrato: 60,
  idLicitacao: 60,
  numeroLicitacao: 60,
  orgao: 200,
  unidadeGestora: 200,
  credor: 300,
  modalidade: 120,
  protocolo: 60,
  objeto: 4000,
  natureza: 300,
  detalhamento: 500,
  processo: 60,
  descricao: 10000,
} as const;

/** O campo de um título de coluna (ou null). */
export function campoDoCabecalho(titulo: unknown): Campo | null {
  const n = norm(String(titulo ?? "")).replace(/\s+/g, " ").trim();
  return CABECALHO[n] ?? null;
}

// ---------------------------------------------------------------- Conversões

/** Texto do export: o "$$" é a vírgula escapada pelo sistema de compras; espaços colapsados; vazio = null. */
export function textoHistorico(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\$\$/g, ",").replace(/\s+/g, " ").trim();
  return s ? s : null;
}

/** Número do export: "10.0000" (ponto decimal), "1.234,56" (pt-BR), número cru da planilha; vazio/inválido = null. */
export function numeroHistorico(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/\s|R\$/g, "").trim();
  if (!s) return null;
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Data do export: dd/mm/aaaa (ou AAAA-MM-DD, ou o nº de série da planilha) → AAAA-MM-DD; inválida = null. */
export function dataHistorico(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && v > 0 && v < 100000) {
    // Série do Excel (dias desde 1899-12-30).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  let a: number;
  let mes: number;
  let dia: number;
  if (m) [dia, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const d = new Date(Date.UTC(a, mes - 1, dia));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- CSV

/**
 * Lê um CSV (o separador sai do cabeçalho: ";" , "," ou TAB) — aspas duplas com "" escapado, quebras CRLF/LF, BOM fora.
 * Linhas vazias saem. Devolve a MATRIZ (a mesma forma da planilha lida pelo SheetJS).
 */
export function lerCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const fimCab = t.search(/\r?\n/);
  const cab = fimCab < 0 ? t : t.slice(0, fimCab);
  const conta = (c: string) => cab.split(c).length - 1;
  const sep = [";", "\t", ","].reduce((m, c) => (conta(c) > conta(m) ? c : m), ";");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo === "") aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
  return linhas;
}

// ---------------------------------------------------------------- Leitura do histórico

export type HistoricoParseado = {
  contratos: ContratoHistorico[];
  itens: CompraHistorico[];
  /** Linhas IDÊNTICAS repetidas pelo export (saíram). */
  repetidas: number;
  /** Linhas sem contrato, código ou descrição (saíram). */
  ignoradas: number;
  /** Colunas obrigatórias que o arquivo não tem (vazio = é um histórico). */
  faltando: string[];
  /** O ano mais recente das assinaturas — sugere o nome. */
  ano: number | null;
};

/** Lê a MATRIZ (CSV ou planilha) do histórico de compra. O cabeçalho é a 1ª linha que tem as colunas obrigatórias. */
export function parseHistoricoCompra(matriz: unknown[][]): HistoricoParseado {
  const vazio = (faltando: string[]): HistoricoParseado => ({ contratos: [], itens: [], repetidas: 0, ignoradas: 0, faltando, ano: null });
  let iCab = -1;
  let colunas: (Campo | null)[] = [];
  for (let i = 0; i < Math.min(matriz.length, 30); i++) {
    const cols = (matriz[i] ?? []).map(campoDoCabecalho);
    if (COLUNAS_OBRIGATORIAS.every((o) => cols.includes(o.campo))) {
      iCab = i;
      colunas = cols;
      break;
    }
  }
  if (iCab < 0) {
    const cols = (matriz[0] ?? []).map(campoDoCabecalho);
    return vazio(COLUNAS_OBRIGATORIAS.filter((o) => !cols.includes(o.campo)).map((o) => o.rotulo));
  }

  const contratos = new Map<string, ContratoHistorico>();
  const itens: CompraHistorico[] = [];
  const vistas = new Set<string>();
  let repetidas = 0;
  let ignoradas = 0;
  let ano: number | null = null;

  for (let i = iCab + 1; i < matriz.length; i++) {
    const linha = matriz[i] ?? [];
    const v: Partial<Record<Campo, string | number | null>> = {};
    colunas.forEach((c, j) => {
      if (!c || v[c] != null) return;
      const bruto = linha[j];
      if (NUMERICOS.has(c)) v[c] = numeroHistorico(bruto);
      else if (DATAS.has(c)) v[c] = dataHistorico(bruto);
      else {
        const t = textoHistorico(bruto);
        const max = (LIMITES_HISTORICO as Record<string, number>)[c];
        v[c] = t && max ? t.slice(0, max).trim() : t;
      }
    });
    const idContrato = (v.idContrato as string | null) ?? null;
    const codigo = String(v.codigo ?? "").replace(/\D/g, "");
    const descricao = (v.descricao as string | null) ?? null;
    if (!idContrato || !codigo || !descricao) {
      if (linha.some((x) => String(x ?? "").trim() !== "")) ignoradas++;
      continue;
    }
    const chave = JSON.stringify(colunas.map((c) => (c ? v[c] : null)));
    if (vistas.has(chave)) {
      repetidas++;
      continue;
    }
    vistas.add(chave);
    if (!contratos.has(idContrato)) {
      const data = (v.dataAssinatura as string | null) ?? null;
      if (data) ano = Math.max(ano ?? 0, Number(data.slice(0, 4)));
      contratos.set(idContrato, {
        idContrato,
        numeroContrato: (v.numeroContrato as string | null) ?? null,
        idLicitacao: (v.idLicitacao as string | null) ?? null,
        numeroLicitacao: (v.numeroLicitacao as string | null) ?? null,
        orgao: (v.orgao as string | null) ?? null,
        unidadeGestora: (v.unidadeGestora as string | null) ?? null,
        credor: (v.credor as string | null) ?? null,
        valorContrato: (v.valorContrato as number | null) ?? null,
        dataAssinatura: data,
        dataPublicacao: (v.dataPublicacao as string | null) ?? null,
        modalidade: (v.modalidade as string | null) ?? null,
        protocolo: (v.protocolo as string | null) ?? null,
        objeto: (v.objeto as string | null) ?? null,
        natureza: (v.natureza as string | null) ?? null,
        detalhamento: (v.detalhamento as string | null) ?? null,
      });
    }
    const seq = v.sequencial != null ? Number(String(v.sequencial).replace(/\D/g, "")) : Number.NaN;
    const n = (k: CampoCompra) => (v[k] as number | null) ?? null;
    itens.push({
      ordem: itens.length,
      idContrato,
      processo: (v.processo as string | null) ?? null,
      codigo,
      sequencial: Number.isInteger(seq) && String(v.sequencial ?? "").trim() !== "" ? seq : null,
      descricao,
      qtdContratada: n("qtdContratada"),
      qtdAditada: n("qtdAditada"),
      qtdEmpenhada: n("qtdEmpenhada"),
      qtdOfEmpenhar: n("qtdOfEmpenhar"),
      saldoEmpenhar: n("saldoEmpenhar"),
      valorUnitario: n("valorUnitario"),
      valorContratado: n("valorContratado"),
      valorEmpenhado: n("valorEmpenhado"),
      saldoValorEmpenhar: n("saldoValorEmpenhar"),
      qtdLiquidada: n("qtdLiquidada"),
      qtdLiquidadaAnulada: n("qtdLiquidadaAnulada"),
      qtdEmpenhadaAnulada: n("qtdEmpenhadaAnulada"),
      saldoLiquidar: n("saldoLiquidar"),
    });
  }
  return { contratos: [...contratos.values()], itens, repetidas, ignoradas, faltando: [], ano };
}

// ---------------------------------------------------------------- Análise

/**
 * O VALOR ATUAL de um produto DENTRO de um contrato (o contrato tem UMA data de assinatura). Os preços distintos > 0:
 * um só = ele (linhas repetidas com o mesmo preço são o mesmo item dividido, não aditivo); dois ou mais = o MENOR
 * somado ao MAIOR — o menor é o ADITIVO lançado sobre o preço do maior (ex.: 8,75 + aditivo 0,80 = 9,55).
 */
export function valorAtualNoContrato(precos: readonly (number | null)[]): { valor: number; base: number; menor: number; aditivo: number | null } | null {
  let menor: number | null = null;
  let maior: number | null = null;
  for (const p of precos) {
    if (p == null || !(p > 0)) continue;
    if (menor == null || p < menor) menor = p;
    if (maior == null || p > maior) maior = p;
  }
  if (menor == null || maior == null) return null;
  return menor === maior ? { valor: maior, base: maior, menor, aditivo: null } : { valor: maior + menor, base: maior, menor, aditivo: menor };
}

/** O produto num contrato: o valor atual (`valorAtualNoContrato`), o MAIOR (`base`) e o MENOR preço das linhas dele,
 * a quantidade contratada e os dados do contrato. */
export type PrecoContrato = {
  idContrato: string;
  valor: number;
  base: number;
  menor: number;
  aditivo: number | null;
  quantidade: number;
  linhas: number;
  data: string | null;
  credor: string | null;
};

export type ProdutoHistorico = {
  codigo: string;
  descricao: string;
  /** Linhas (itens contratados) do produto. */
  linhas: number;
  contratos: number;
  credores: number;
  quantidade: number;
  valorTotal: number;
  /** Os contratos com valor atual, do assinado por ÚLTIMO ao mais antigo (empate na data: o de maior ordem primeiro). */
  porContrato: PrecoContrato[];
  /** Menor/maior/médio e variação = ENTRE CONTRATOS DIFERENTES, sobre o valor atual de cada um (`porContrato`). */
  menor: number | null;
  maior: number | null;
  /** O CONTRATO do menor e do maior valor atual (empate: o assinado por último). */
  contratoMenor: PrecoContrato | null;
  contratoMaior: PrecoContrato | null;
  medio: number | null;
  /** Coeficiente de variação dos valores atuais dos contratos (a MESMA régua da visão Consolidada da Mesa —
   * `FAIXAS_VARIACAO`); `null` = menos de 2 contratos com preço. */
  variacao: number | null;
  /** O VALOR ATUAL do produto = o do contrato assinado por último (`porContrato[0]`). */
  atual: PrecoContrato | null;
};

/** Um por CÓDIGO, na ordem do maior valor contratado. Linear (+ a ordenação dos contratos de cada produto). */
export function produtosDoHistorico(itens: readonly CompraHistorico[], contratos: readonly ContratoHistorico[]): ProdutoHistorico[] {
  const contratoPorId = new Map(contratos.map((c) => [c.idContrato, c] as const));
  type Grupo = { linhas: { preco: number | null; qtd: number }[]; ordem: number };
  type Acc = { p: ProdutoHistorico; grupos: Map<string, Grupo>; credores: Set<string> };
  const m = new Map<string, Acc>();
  for (const it of itens) {
    let a = m.get(it.codigo);
    if (!a) {
      a = {
        p: { codigo: it.codigo, descricao: it.descricao, linhas: 0, contratos: 0, credores: 0, quantidade: 0, valorTotal: 0, porContrato: [], menor: null, maior: null, contratoMenor: null, contratoMaior: null, medio: null, variacao: null, atual: null },
        grupos: new Map(),
        credores: new Set(),
      };
      m.set(it.codigo, a);
    }
    const c = contratoPorId.get(it.idContrato);
    a.p.linhas++;
    if (c?.credor) a.credores.add(c.credor);
    const q = it.qtdContratada ?? 0;
    a.p.quantidade += q;
    a.p.valorTotal += it.valorContratado ?? (it.valorUnitario ?? 0) * q;
    const g = a.grupos.get(it.idContrato);
    if (g) {
      g.linhas.push({ preco: it.valorUnitario, qtd: q });
      g.ordem = Math.max(g.ordem, it.ordem);
    } else a.grupos.set(it.idContrato, { linhas: [{ preco: it.valorUnitario, qtd: q }], ordem: it.ordem });
  }
  const out: ProdutoHistorico[] = [];
  for (const { p, grupos, credores } of m.values()) {
    const lista: (PrecoContrato & { _o: number })[] = [];
    for (const [idContrato, g] of grupos) {
      const v = valorAtualNoContrato(g.linhas.map((l) => l.preco));
      if (!v) continue;
      const c = contratoPorId.get(idContrato);
      // A quantidade = as linhas no preço BASE (a linha do aditivo repete a quantidade do item; somá-la dobraria).
      const quantidade = g.linhas.reduce((s, l) => s + (l.preco === v.base ? l.qtd : 0), 0);
      lista.push({ idContrato, ...v, quantidade, linhas: g.linhas.length, data: c?.dataAssinatura ?? null, credor: c?.credor ?? null, _o: g.ordem });
    }
    lista.sort((x, y) => (y.data ?? "").localeCompare(x.data ?? "") || y._o - x._o);
    const porContrato = lista.map(({ _o, ...pc }) => pc);
    const valores = porContrato.map((pc) => pc.valor);
    let contratoMenor: PrecoContrato | null = null;
    let contratoMaior: PrecoContrato | null = null;
    for (const pc of porContrato) {
      if (!contratoMenor || pc.valor < contratoMenor.valor) contratoMenor = pc;
      if (!contratoMaior || pc.valor > contratoMaior.valor) contratoMaior = pc;
    }
    out.push({
      ...p,
      contratos: grupos.size,
      credores: credores.size,
      porContrato,
      menor: contratoMenor?.valor ?? null,
      maior: contratoMaior?.valor ?? null,
      contratoMenor,
      contratoMaior,
      medio: valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null,
      variacao: coeficienteVariacao(valores),
      atual: porContrato[0] ?? null,
    });
  }
  return out.sort((x, y) => y.valorTotal - x.valorTotal || x.codigo.localeCompare(y.codigo));
}

/** O rótulo da FAIXA de variação (o valor do filtro da coluna Variação — a régua `FAIXAS_VARIACAO`). */
export function rotuloVariacao(cv: number | null): string {
  const n = nivelVariacao(cv);
  return n === "alerta" ? "Alta (acima de 50%)" : n === "atencao" ? "Atenção (25% a 50%)" : n === "ok" ? "Homogênea (até 25%)" : "Sem comparação (1 preço)";
}

export type ResumoHistorico = {
  itens: number;
  contratos: number;
  produtos: number;
  credores: number;
  valorContratado: number;
  valorEmpenhado: number;
  de: string | null;
  ate: string | null;
};

export function resumoHistorico(itens: readonly CompraHistorico[], contratos: readonly ContratoHistorico[]): ResumoHistorico {
  let valorContratado = 0;
  let valorEmpenhado = 0;
  const produtos = new Set<string>();
  for (const it of itens) {
    valorContratado += it.valorContratado ?? 0;
    valorEmpenhado += it.valorEmpenhado ?? 0;
    produtos.add(it.codigo);
  }
  const datas = contratos.map((c) => c.dataAssinatura).filter((d): d is string => !!d).sort();
  return {
    itens: itens.length,
    contratos: contratos.length,
    produtos: produtos.size,
    credores: new Set(contratos.map((c) => c.credor).filter(Boolean)).size,
    valorContratado,
    valorEmpenhado,
    de: datas[0] ?? null,
    ate: datas[datas.length - 1] ?? null,
  };
}

/** Nome sugerido para o histórico importado. */
export function nomeSugeridoHistorico(ano: number | null): string {
  return ano ? `Histórico de compra ${ano}` : "Histórico de compra";
}
