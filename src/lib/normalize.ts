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

// Texto "comum" (ASCII imprimível + Latin-1 imprimível, sem o NBSP e o hífen suave) — o caso de quase todo trecho
// lido do DFD: basta colapsar os espaços (atalho de desempenho — protocolos têm centenas de milhares de trechos).
const RE_TEXTO_COMUM = /^[\x20-\x7E\u00A1-\u00AC\u00AE-\u00FF]*$/;
// Invisíveis que não são conteúdo: controles C0/C1, formatação Unicode (Cf: largura zero, hífen suave, marcas
// bidi, BOM…), surrogates órfãos, caractere de substituição (U+FFFD) e não-caracteres.
const RE_INVISIVEL = /[\p{Cc}\p{Cf}\p{Cs}\uFFFD\uFFFE\uFFFF]/gu;
// C1 (U+0080–U+009F) no texto é quase sempre Windows-1252 lido como Latin-1 ("–" chega como U+0096): volta à
// PONTUAÇÃO certa. As letras estrangeiras do 1252 (Š Ž Œ Ÿ ƒ…) e os códigos indefinidos NÃO voltam (em texto do DFD
// são lixo, não conteúdo) — somem com os demais controles; o U+0085 (NEL) é quebra de linha ⇒ espaço.
const CP1252: Record<string, string> = {
  "\u0080": "\u20AC", "\u0082": "\u201A", "\u0084": "\u201E", "\u0086": "\u2020", "\u0087": "\u2021",
  "\u0089": "\u2030", "\u008B": "\u2039", "\u0091": "\u2018", "\u0092": "\u2019", "\u0093": "\u201C", "\u0094": "\u201D",
  "\u0095": "\u2022", "\u0096": "\u2013", "\u0097": "\u2014", "\u0099": "\u2122", "\u009B": "\u203A",
};
// Fonte Symbol/Wingdings SEM mapa Unicode: o PDF entrega o caractere no USO PRIVADO (U+F000 + o código da fonte) — e o
// MESMO código é um símbolo na Symbol e um MARCADOR na Wingdings. Só voltam ao real os que não colidem com marcador de
// lista (matemática e as letras gregas de especificação: ± ≥ ≤ ° × ÷ ≠ ≈ √ ′ ″ Δ Ω α β δ ε φ γ e as setas); o "µ" só
// ANTES de uma unidade ("µm", "µF" — a Wingdings usa o mesmo código como marcador); o resto (U+F0B7 •, U+F0A7 ▪, U+F0D8
// ➢, U+F0FC ✓, U+F076 ❖, U+F074 ⧫, U+F06C ●, U+F06E ■…) e os desconhecidos viram "•" (marcador).
const SIMBOLO_PUA: Record<string, string> = {
  "\uF02D": "-", "\uF044": "\u0394", "\uF057": "\u03A9", "\uF061": "\u03B1", "\uF062": "\u03B2", "\uF064": "\u03B4",
  "\uF065": "\u03B5", "\uF066": "\u03C6", "\uF067": "\u03B3", "\uF0A2": "\u2032", "\uF0A3": "\u2264",
  "\uF0AC": "\u2190", "\uF0AD": "\u2191", "\uF0AE": "\u2192", "\uF0AF": "\u2193", "\uF0B0": "\u00B0",
  "\uF0B1": "\u00B1", "\uF0B2": "\u2033", "\uF0B3": "\u2265", "\uF0B4": "\u00D7", "\uF0B8": "\u00F7",
  "\uF0B9": "\u2260", "\uF0BB": "\u2248", "\uF0D6": "\u221A",
};

/**
 * Texto CAPTURADO (PDF/planilha) limpo: sem caracteres invisíveis/de controle (largura zero, hífen suave, BOM,
 * marcas bidi, U+FFFD), com TAB/quebra/NBSP/espaços Unicode virando UM espaço, acentos compostos juntos (NFC —
 * "C" + cedilha combinante vira "Ç"), o Windows-1252 mal decodificado consertado e o caractere de USO PRIVADO da
 * fonte Symbol/Wingdings (que a tela mostrava como um quadrado) virando o símbolo real (±, ≥, µ…) ou "•" (marcador
 * de lista). Não mexe em nenhum caractere visível (pontuação, "²", "®", "°"…). Idempotente. Puro.
 */
export function limparTexto(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (RE_TEXTO_COMUM.test(s)) return s.replace(/\s+/g, " ").trim();
  return s
    .replace(/\uFEFF/g, "") // BOM/ZWNBSP: largura zero (não é espaço)
    .replace(/[\u0080-\u009F]/g, (c) => CP1252[c] ?? c)
    .replace(/[\s\u0085]/g, " ")
    .replace(RE_INVISIVEL, "")
    .replace(/\uF06D(?=[A-Za-z])/g, "\u00B5") // "µ" da Symbol só antes de uma unidade (µm, µF, µg…)
    .replace(/\p{Co}/gu, (c) => SIMBOLO_PUA[c] ?? "\u2022")
    .normalize("NFC")
    .replace(/(^|\s)\p{M}+/gu, "$1") // acento órfão (sem letra)
    .replace(/\s+/g, " ")
    .trim();
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

/**
 * Dois valores monetários "batem" (tolerância de 1 centavo p/ ruído de ponto
 * flutuante). `null` de qualquer lado nunca bate — usado para conferir o Valor da
 * capa do protocolo contra a somatória dos valores dos DFDs.
 */
export function valoresBatem(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.01;
}

export type DataParts = { iso: string; mes: number; ano: number } | null;

/** Aceita Date (serial do Excel), "dd/mm/yyyy" ou ISO "yyyy-mm-dd". */
export function parseDataDesejada(v: unknown): DataParts {
  if (v == null || v === "") return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
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

// ---------------------------------------------------------------------------
// Normalização de seções tratáveis do DFD (PRIORIDADE / PREVISÃO DE ENTREGA).
// Puro/testável. `auto=true` = corrigiu/padronizou; `valor=null` = precisa de
// tratamento manual. O texto canônico é gravado de volta em `secoes[i].texto`.
// ---------------------------------------------------------------------------

export type Prioridade = "ALTA" | "MÉDIA" | "BAIXA";

/** PRIORIDADE → só ALTA/MÉDIA/BAIXA (auto-corrige variações; vazio/estranho → null). */
export function normPrioridade(texto: string | null | undefined): { valor: Prioridade | null; auto: boolean } {
  const raw = String(texto ?? "").trim();
  if (!raw) return { valor: null, auto: false };
  const s = stripAccents(cleanUpper(raw)).replace(/^PRIORIDADE\s*/, "").trim();
  let valor: Prioridade | null = null;
  if (/\b(ALTA|ALTO|URGENTE|URGENCIA)\b/.test(s)) valor = "ALTA";
  else if (/\b(MEDIA|MEDIO|NORMAL|MODERAD[AO])\b/.test(s)) valor = "MÉDIA";
  else if (/\b(BAIXA|BAIXO)\b/.test(s)) valor = "BAIXA";
  if (valor == null) return { valor: null, auto: false };
  return { valor, auto: cleanUpper(raw) !== valor };
}

export const MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];
const MESES_SEM = MESES.map(stripAccents); // sem acento p/ casar

/**
 * PREVISÃO DE ENTREGA/EXECUÇÃO — é **um OU outro**: uma DATA (`MÊS/AAAA`, ex.:
 * `FEVEREIRO/2027`) OU recorrente `ANUAL` (opcionalmente `ANUAL/AAAA`). Reconhece as
 * várias escritas de cada forma:
 *  - DATA: `dd/mm/aaaa`, `mm/aaaa`, `MÊS DE AAAA`, `A PARTIR DE MÊS DE AAAA` e **só o MÊS
 *    por extenso** (ex.: `FEVEREIRO`, sem ano) — nesse caso o ANO vem do `anoPca` (o ano
 *    do PCA do processo; o usuário ainda pode editar). Sem `anoPca` e sem ano no texto, o
 *    mês fica reconhecido mas sem ano → `null` (a definir).
 *  - ANUAL: `ANUAL`, `ANUALMENTE`, `MENSAL(MENTE)`, `AO LONGO/DECORRER/DURANTE do ano`,
 *    `TODO O ANO`, `POR N MESES`, `12 MESES` (o ano inteiro) — com ou sem ano. Bare "ANUAL" (sem ano) é VÁLIDO.
 * O ano do texto tem precedência; sem ele, usa-se o `anoPca` (regra: a previsão do DFD
 * segue o ano do PCA do processo). O que não casar nenhuma das duas → null (tratar à mão).
 * Recorrente vence a data. `auto=true` = reconheceu mas a escrita não era canônica.
 */
export function normPrevisao(
  texto: string | null | undefined,
  anoPca?: number | null,
): { valor: string | null; anual: boolean; auto: boolean } {
  const raw = String(texto ?? "").trim();
  if (!raw) return { valor: null, anual: false, auto: false };
  const s = stripAccents(cleanUpper(raw));
  const anoTexto = s.match(/\b(20\d{2})\b/)?.[1] ?? null;
  // Ano efetivo: o do texto tem precedência; sem ele, o do PCA (previsão segue o PCA).
  const anoPcaStr = anoPca != null && anoPca >= 2000 && anoPca <= 2100 ? String(anoPca) : null;
  const ano = anoTexto ?? anoPcaStr;
  const recorrente =
    /\b(MENSAL(?:MENTE)?|DECORRER|AO LONGO|LONGO DE|DURANTE|ANUAL(?:MENTE)?|TODO O ANO)\b|POR\s+\d+\s+MES|\b(12|DOZE)\s+MESES\b/.test(s);
  if (recorrente) {
    // "Anual" é válido mesmo sem ano; com ano (do texto ou do PCA) vira `ANUAL/AAAA`.
    const valor = ano ? `ANUAL/${ano}` : "ANUAL";
    return { valor, anual: true, auto: cleanUpper(raw) !== valor };
  }
  // Mês — reconhecido MESMO sem ano no texto (o ano pode vir do PCA / edição do usuário).
  let mes: number | null = null;
  const dmy = s.match(/\b(\d{1,2})\/(\d{1,2})\/20\d{2}\b/);
  const my = s.match(/\b(\d{1,2})\/20\d{2}\b/);
  if (dmy) mes = Number(dmy[2]);
  else if (my) mes = Number(my[1]);
  else {
    const idx = MESES_SEM.findIndex((m) => new RegExp(`\\b${m}\\b`).test(s));
    if (idx >= 0) mes = idx + 1;
  }
  if (mes == null || mes < 1 || mes > 12) return { valor: null, anual: false, auto: false };
  if (!ano) return { valor: null, anual: false, auto: false }; // mês reconhecido, mas ano a definir
  const valor = `${MESES[mes - 1]}/${ano}`;
  return { valor, anual: false, auto: cleanUpper(raw) !== valor };
}
