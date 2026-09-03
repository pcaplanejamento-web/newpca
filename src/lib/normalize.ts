/**
 * Normalização dos dados "crus" da planilha do PCA.
 *
 * Módulo puro (sem SheetJS, sem D1) — roda no servidor (fonte da verdade) e
 * poderia rodar no cliente para preview. Guardamos sempre o valor cru para
 * exibição e derivamos um valor canônico (`*Norm`) para agrupar em gráficos.
 */

/** Remove acentos (para casar variações tipo SERVIÇO vs SERVICO). */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Uppercase + colapsa espaços/quebras de linha + trim + tira pontuação solta nas pontas. */
export function cleanUpper(raw: unknown): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:\-–—]+/g, "")
    .replace(/[\s.,;:\-–—]+$/g, "")
    .trim()
    .toUpperCase();
}

/** Aceita número ou string em pt-BR ("1.234,56") ou en ("1234.56"). */
export function parseNumberBR(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // último separador é o decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseIntBR(v: unknown): number | null {
  const n = parseNumberBR(v);
  return n == null ? null : Math.trunc(n);
}

export type DataParts = { iso: string; mes: number; ano: number } | null;

/** Aceita Date (serial do Excel), "dd/mm/yyyy" ou ISO "yyyy-mm-dd". */
export function parseDataDesejada(v: unknown): DataParts {
  if (v == null || v === "") return null;

  if (v instanceof Date && !isNaN(v.getTime())) {
    return build(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy (ou d/m/yy)
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const dia = +m[1];
    const mes = +m[2];
    let ano = +m[3];
    if (ano < 100) ano += ano < 70 ? 2000 : 1900;
    return build(ano, mes, dia);
  }

  // ISO yyyy-mm-dd (ou com timestamp)
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return build(+m[1], +m[2], +m[3]);

  return null;
}

function build(ano: number, mes: number, dia: number): DataParts {
  if (!ano || !mes || mes < 1 || mes > 12) return null;
  const d = Math.min(Math.max(dia || 1, 1), 31);
  const iso = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { iso, mes, ano };
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

export const CLASSIFICACAO_INDEFINIDA = "NÃO CLASSIFICADO";

// Chave = valor limpo e SEM acento. Valor = rótulo canônico (com acento) exibido.
const CLASSIFICACAO_SINONIMOS: Record<string, string> = {
  SERVICO: "SERVIÇO",
  SERVICOS: "SERVIÇO",
  "PRESTACAO DE SERVICO": "PRESTAÇÃO DE SERVIÇO",
  CONSUMO: "CONSUMO",
  "MATERIAL DE CONSUMO": "MATERIAL DE CONSUMO",
  "MATERIAIS DE CONSUMO": "MATERIAL DE CONSUMO",
  "MATERIAL DE EXPEDIENTE": "MATERIAL DE EXPEDIENTE",
  "MATERIAL EXPEDIENTE": "MATERIAL DE EXPEDIENTE",
  PERMANENTE: "PERMANENTE",
  "EQUIPAMENTO E MATERIAL PERMANENTE": "EQUIPAMENTO E MATERIAL PERMANENTE",
  "EQUIPAMENTOS E MATERIAL PERMANENTE": "EQUIPAMENTO E MATERIAL PERMANENTE",
  "OBRAS E INSTALACOES": "OBRAS E INSTALAÇÕES",
  "OBRAS INSTALACOES": "OBRAS E INSTALAÇÕES",
  LOCACAO: "LOCAÇÃO",
  "LOCACAO DE VEICULO": "LOCAÇÃO DE VEÍCULO",
  "LOCACAO DE BENS MOVEIS E OUTRAS NATUREZAS E INTANGIVEIS":
    "LOCAÇÃO DE BENS MÓVEIS E INTANGÍVEIS",
  FERRAMENTA: "FERRAMENTAS",
  "MAQUINAS, FERRAMENTAS E UTENSILIOS DE OFICINA":
    "MÁQUINAS, FERRAMENTAS E UTENSÍLIOS DE OFICINA",
  "GENEROS ALIMENTICIOS": "GÊNEROS ALIMENTÍCIOS",
  "GENEROS DE ALIMENTACAO": "GÊNEROS ALIMENTÍCIOS",
  "AUXILIO ALIMENTACAO": "AUXÍLIO ALIMENTAÇÃO",
  "MATERIAL ELETRICO E ELETRONICO": "MATERIAL ELÉTRICO E ELETRÔNICO",
  "MATERIAL ELETRICO": "MATERIAL ELÉTRICO E ELETRÔNICO",
  "UNIFORMES, TECIDOS E AVIAMENTOS": "UNIFORMES, TECIDOS E AVIAMENTOS",
  "DISTRIBUICAO GRATUITA": "DISTRIBUIÇÃO GRATUITA",
  "SERVICOS GRAFICOS": "SERVIÇOS GRÁFICOS",
  PRODUTO: "PRODUTO",
};

/** Canoniza a classificação. Códigos numéricos soltos viram "NÃO CLASSIFICADO". */
export function normClassificacao(raw: unknown): string {
  const c = cleanUpper(raw);
  if (!c) return CLASSIFICACAO_INDEFINIDA;
  if (/^\d+$/.test(c)) return CLASSIFICACAO_INDEFINIDA; // ex.: "119", "139"
  const key = stripAccents(c);
  return CLASSIFICACAO_SINONIMOS[key] ?? c;
}

// ---------------------------------------------------------------------------
// Unidade de medida
// ---------------------------------------------------------------------------

const UNIDADE_SINONIMOS: Record<string, string> = {
  UNIDADE: "UNIDADE",
  UNID: "UNIDADE",
  "UNID.": "UNIDADE",
  UND: "UNIDADE",
  UN: "UNIDADE",
  UNIDADES: "UNIDADE",
  MES: "MÊS",
  MESES: "MÊS",
  KG: "KG",
  KILO: "KG",
  KILOS: "KG",
  QUILO: "KG",
  QUILOS: "KG",
  G: "GRAMA",
  GRAMA: "GRAMA",
  METR: "METRO",
  METRO: "METRO",
  METROS: "METRO",
  MT: "METRO",
  M: "METRO",
  M2: "M²",
  M3: "M³",
  LT: "LITRO",
  L: "LITRO",
  LITRO: "LITRO",
  LITROS: "LITRO",
  CENT: "CENTO",
  CENTO: "CENTO",
  PCT: "PACOTE",
  PACOTE: "PACOTE",
  CX: "CAIXA",
  CAIXA: "CAIXA",
  PC: "PEÇA",
  "PC.": "PEÇA",
  PECA: "PEÇA",
  ROLO: "ROLO",
  PAR: "PAR",
  PARES: "PAR",
  SRV: "SERVIÇO",
  SERV: "SERVIÇO",
  SERVICO: "SERVIÇO",
  RESMA: "RESMA",
  FRASCO: "FRASCO",
  FD: "FARDO",
  FARDO: "FARDO",
};

export function normUnidadeMedida(raw: unknown): string {
  const c = cleanUpper(raw);
  if (!c) return "—";
  // normaliza superscritos (M² -> M2, M³ -> M3) para casar variações
  const key = stripAccents(c).replace(/²/g, "2").replace(/³/g, "3");
  const extra: Record<string, string> = {
    M2: "M²",
    "M 2": "M²",
    METRO2: "M²",
    METROS2: "M²",
    "METRO QUADRADO": "M²",
    M3: "M³",
    "M 3": "M³",
    METRO3: "M³",
    METROS3: "M³",
    "METRO CUBICO": "M³",
    PACOTES: "PACOTE",
    "PRESTACAO SERVICO": "SERVIÇO",
    "PRESTACAO DE SERVICO": "SERVIÇO",
  };
  return UNIDADE_SINONIMOS[key] ?? extra[key] ?? c;
}

// ---------------------------------------------------------------------------
// Linha completa
// ---------------------------------------------------------------------------

export type LinhaCrua = {
  idProduto?: unknown;
  sequencial?: unknown;
  nomeProduto?: unknown;
  unidadeMedida?: unknown;
  quantidade?: unknown;
  valorReferencia?: unknown;
  classificacao?: unknown;
  dataDesejada?: unknown;
};

export type LinhaNormalizada = {
  idProduto: string | null;
  sequencial: number | null;
  nomeProduto: string | null;
  unidadeMedida: string | null;
  unidadeMedidaNorm: string;
  quantidade: number | null;
  valorReferencia: number | null;
  valorTotal: number | null;
  classificacao: string | null;
  classificacaoNorm: string;
  dataDesejada: string | null;
  mesDesejado: number | null;
  anoDesejado: number | null;
};

export function normalizarLinha(row: LinhaCrua): LinhaNormalizada {
  const quantidade = parseNumberBR(row.quantidade);
  const valorReferencia = parseNumberBR(row.valorReferencia);
  const valorTotal =
    quantidade != null && valorReferencia != null
      ? Math.round(quantidade * valorReferencia * 100) / 100
      : null;
  const data = parseDataDesejada(row.dataDesejada);
  const nome = row.nomeProduto == null ? null : String(row.nomeProduto).trim();
  const uMedidaRaw =
    row.unidadeMedida == null ? null : String(row.unidadeMedida).trim();
  const classRaw =
    row.classificacao == null ? null : String(row.classificacao).trim();

  return {
    idProduto: row.idProduto == null ? null : String(row.idProduto).trim(),
    sequencial: parseIntBR(row.sequencial),
    nomeProduto: nome || null,
    unidadeMedida: uMedidaRaw || null,
    unidadeMedidaNorm: normUnidadeMedida(row.unidadeMedida),
    quantidade,
    valorReferencia,
    valorTotal,
    classificacao: classRaw || null,
    classificacaoNorm: normClassificacao(row.classificacao),
    dataDesejada: data?.iso ?? null,
    mesDesejado: data?.mes ?? null,
    anoDesejado: data?.ano ?? null,
  };
}

/** Uma linha "vale" se tiver nome de produto OU algum valor. */
export function linhaTemConteudo(row: LinhaCrua): boolean {
  const nome = row.nomeProduto == null ? "" : String(row.nomeProduto).trim();
  const id = row.idProduto == null ? "" : String(row.idProduto).trim();
  return nome.length > 0 || id.length > 0;
}
