import { parseNumberBR, stripAccents } from "./normalize.ts";

/**
 * Lógica PURA compartilhada entre os parsers de DFD (planilha `.xlsx` e `.pdf`).
 * O cabeçalho (rótulos "Label: valor") e as SEÇÕES numeradas são idênticos nos
 * dois formatos — mudam só a origem das "linhas" e a extração da tabela. Aqui
 * ficam os tipos, os helpers e as duas rotinas reaproveitadas.
 */

export type DfdSecao = { numero: number; titulo: string; texto: string };

export type DfdItemParseado = {
  item: number | null;
  codigo: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type DfdParseado = {
  numero: string;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  orgaoEntidade: string | null;
  setorRequisitante: string | null;
  siglaSetor: string | null;
  responsavel: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  valorEstimado: number | null;
  valorTotal: number | null;
  nomeArquivo: string;
  secoes: DfdSecao[];
  itens: DfdItemParseado[];
};

/** UPPER + sem acento + espaços colapsados (p/ casar rótulos/cabeçalhos). */
export function norm(v: unknown): string {
  return stripAccents(
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  );
}

export function txt(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export const RE_VALOR = /R\$\s*([\d.]+,\d{2})/;

/** Primeiro grupo capturado não-vazio ao aplicar `re` a alguma das linhas. */
export function buscar(linhas: string[], re: RegExp): string | null {
  for (const s of linhas) {
    const m = s.match(re);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

/** Ruído de cabeçalho/rodapé repetido nas quebras de página (não é conteúdo). */
export function ehRuido(s: string): boolean {
  const n = norm(s);
  return (
    n.startsWith("CENTI") ||
    n.startsWith("EMITIDO EM") ||
    n.startsWith("PAGINA ") ||
    n === "ESTADO DE GOIAS" ||
    n === "PREFEITURA MUNICIPAL DE RIO VERDE" ||
    n.startsWith("DOCUMENTO DE FORMALIZACAO") ||
    /NUMERO DFD/.test(n) ||
    n.startsWith("TIPO DFD")
  );
}

export type Cabecalho = {
  numero: string | null;
  planejamento: string | null;
  tipo: string | null;
  objeto: string | null;
  orgaoEntidade: string | null;
  setorRequisitante: string | null;
  siglaSetor: string | null;
  responsavel: string | null;
  matricula: string | null;
  email: string | null;
  telefone: string | null;
  valorEstimado: number | null;
};

/**
 * Extrai os campos do cabeçalho a partir de "linhas" (célula do `.xlsx` ou linha
 * de texto do `.pdf`). As regex param no rótulo seguinte (ex.: Responsável antes
 * de "Matrícula") para não vazar valor quando dois pares "Label: valor" dividem a
 * mesma linha do PDF.
 */
export function extrairCabecalho(linhas: string[]): Cabecalho {
  const numero = buscar(linhas, /N[úu]mero\s+DFD\s*:?\s*(\d+)/i);
  const planejamento = buscar(linhas, /Planejamento\s*:?\s*(\d+)/i);
  const tipo = buscar(linhas, /Tipo\s+DFD\s*:?\s*(.+)/i);
  const orgaoEntidade = buscar(linhas, /[ÓO]rg[ãa]o\s*\/?\s*Entidade\s*:?\s*(.+)/i);
  const setorRequisitante = buscar(linhas, /Setor\s+Requisitante\s*:?\s*(.+)/i);
  const responsavel = buscar(
    linhas,
    /Respons[áa]vel\s+pela\s+Demanda\s*:?\s*(.+?)(?:\s+Matr[íi]cula\b|$)/i,
  );
  const matricula = buscar(linhas, /Matr[íi]cula\s*:?\s*(\S+)/i);
  const email = buscar(linhas, /E-?mail\s*:?\s*([^\s]+@[^\s]+)/i);
  const telefone = buscar(linhas, /Telefone\s*:?\s*(\S.*)$/i);

  // objeto = texto antes de "Número DFD" na linha que o contém (ex.: F5).
  const linhaNum = linhas.find((s) => /N[úu]mero\s+DFD/i.test(s));
  const objeto = linhaNum
    ? linhaNum
        .split(/N[úu]mero\s+DFD/i)[0]
        .replace(/[\s:–—-]+$/, "")
        .trim() || null
    : null;

  // sigla do setor = trecho antes de " - " (só quando há separador claro).
  let siglaSetor: string | null = null;
  if (setorRequisitante) {
    const partes = setorRequisitante.split(/\s+[-–—]\s+/);
    if (partes.length > 1) siglaSetor = norm(partes[0]) || null;
  }

  // valor estimado: prefere a linha que contém "ESTIMATIVA"; senão o 1º "R$".
  const comEstimativa = linhas.find(
    (s) => /ESTIMATIVA/i.test(stripAccents(s)) && RE_VALOR.test(s),
  );
  const alvo = comEstimativa ?? linhas.find((s) => RE_VALOR.test(s));
  const valorEstimado = alvo ? parseNumberBR(alvo.match(RE_VALOR)?.[1] ?? null) : null;

  return {
    numero,
    planejamento,
    tipo,
    objeto,
    orgaoEntidade,
    setorRequisitante,
    siglaSetor,
    responsavel,
    matricula,
    email,
    telefone,
    valorEstimado,
  };
}

/**
 * Coleta as SEÇÕES numeradas ("N - TÍTULO" + texto). Recebe a lista de "linhas
 * iniciais" (1ª célula da linha no `.xlsx` / texto da linha no `.pdf`). Pula a
 * Seção 1 (vira campos) e a 4 (tabela de itens) e ignora o ruído de página.
 */
export function coletarSecoes(leadings: string[]): DfdSecao[] {
  const brutas: { numero: number; titulo: string; linhas: string[] }[] = [];
  let atual: { numero: number; titulo: string; linhas: string[] } | null = null;
  for (const cell of leadings) {
    if (!cell) continue;
    const m = cell.match(/^(\d{1,2})\s*[-–—]\s*(.+)$/);
    if (m) {
      atual = { numero: Number(m[1]), titulo: m[2].trim(), linhas: [] };
      brutas.push(atual);
      continue;
    }
    if (atual && !ehRuido(cell)) atual.linhas.push(cell);
  }
  return brutas
    .filter((s) => s.numero !== 1 && s.numero !== 4)
    .map((s) => ({ numero: s.numero, titulo: s.titulo, texto: s.linhas.join("\n").trim() }))
    .filter((s) => s.texto.length > 0);
}
