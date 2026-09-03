import * as XLSX from "xlsx";
import { stripAccents } from "./normalize";

/**
 * Parser da planilha do PCA — roda NO NAVEGADOR (mantém o SheetJS fora do
 * bundle do Worker). Extrai Código/Município do cabeçalho e as linhas cruas;
 * a normalização definitiva acontece no servidor (`/api/upload`).
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
};

export type PlanilhaParseada = {
  codigo: string;
  municipio: string;
  nomeArquivo: string;
  rows: LinhaCruaUpload[];
};

const HEADER_MAP: Record<string, keyof LinhaCruaUpload> = {
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
};

function key(v: unknown): string {
  return stripAccents(
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  );
}

function cellToStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  return String(v).trim() || null;
}

function cellRaw(v: unknown): string | number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v).trim() || null;
}

export async function parsePlanilha(file: File): Promise<PlanilhaParseada> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { cellDates: true });
  } catch {
    throw new Error("Não consegui ler o arquivo. Confirme que é um .xlsx válido.");
  }

  const ws = wb.Sheets["Pca"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia ou sem abas.");

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  let codigo = "";
  let municipio = "";
  let headerRow = -1;
  const colMap: Record<number, keyof LinhaCruaUpload> = {};

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const a = key(row[0]);
    if (a === "CODIGO" && row[1] != null) codigo = String(row[1]).trim();
    if (a === "MUNICIPIO" && row[1] != null) municipio = String(row[1]).trim();

    const matches = row.filter((c) => HEADER_MAP[key(c)]).length;
    if (matches >= 4) {
      headerRow = r;
      row.forEach((c, i) => {
        const field = HEADER_MAP[key(c)];
        if (field) colMap[i] = field;
      });
      break;
    }
  }

  if (headerRow < 0) {
    throw new Error(
      "Não encontrei o cabeçalho da planilha (Id Produto, Nome do Produto, Quantidade, Valor Referência...). Confira se é a planilha do PCA.",
    );
  }
  if (!codigo) {
    throw new Error(
      "Não encontrei o “Código” da unidade no cabeçalho da planilha.",
    );
  }

  const rows: LinhaCruaUpload[] = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const obj: Partial<Record<keyof LinhaCruaUpload, unknown>> = {};
    for (const [i, field] of Object.entries(colMap)) obj[field] = row[+i];

    const nome = cellToStr(obj.nomeProduto);
    const id = cellRaw(obj.idProduto);
    if (!nome && id == null) continue; // linha vazia -> fim/pulo

    rows.push({
      idProduto: cellRaw(obj.idProduto),
      sequencial: cellRaw(obj.sequencial),
      nomeProduto: nome,
      unidadeMedida: cellToStr(obj.unidadeMedida),
      quantidade: cellRaw(obj.quantidade),
      valorReferencia: cellRaw(obj.valorReferencia),
      classificacao: cellToStr(obj.classificacao),
      dataDesejada: cellToStr(obj.dataDesejada),
    });
  }

  if (rows.length === 0) {
    throw new Error("Encontrei o cabeçalho, mas nenhuma linha de item preenchida.");
  }

  return {
    codigo,
    municipio: municipio || "MUNICÍPIO NÃO INFORMADO",
    nomeArquivo: file.name,
    rows,
  };
}
