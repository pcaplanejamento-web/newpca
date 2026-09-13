import { parseNumberBR } from "./normalize.ts";
import { buscar, extrairCabecalho } from "./parse-dfd-comum.ts";
import { linhasDeTexto, type PdfItem } from "./parse-dfd-pdf-core.ts";

/**
 * Núcleo PURO do parser de PROTOCOLO em PDF (o "processo" que empacota vários
 * DFDs). Para ESCALAR a milhares de DFDs, o protocolo é lido em 2 passos:
 *  1. **índice leve** (aqui): recebe o TEXTO por página (`{page, lines}` — barato,
 *     sem geometria) e devolve a capa + a lista de DFDs detectados, cada um só com
 *     o CABEÇALHO (nº, setor, órgão, objeto) e suas páginas. Não remonta tabelas →
 *     memória O(nº de DFDs), sem travar.
 *  2. **parse completo por DFD** (no import/no "Ver"): `parseDfdFromPdfItems` sobre
 *     as páginas daquele DFD, sob demanda (ver `parse-protocolo-pdf.ts`).
 * Testável no Node com páginas sintéticas.
 */

export type ProtocoloMeta = {
  numero: string | null; // "Número Processo" (ex.: "144756/2026")
  data: string | null;
  interessado: string | null;
  documento: string | null; // CPF/CNPJ do interessado
  assunto: string | null;
  valorCapa: number | null; // "Valor" da capa
  observacao: string | null;
  localReparticao: string | null; // texto cru (ex.: "COMPRAS FMAS")
  nomeArquivo: string | null;
};

/** Um DFD detectado no bundle — só cabeçalho + páginas (parse completo é depois). */
export type DfdIndexado = {
  numero: string;
  pages: number[];
  setorRequisitante: string | null;
  siglaSetor: string | null;
  orgaoEntidade: string | null;
  objeto: string | null;
};

export type ProtocoloIndex = {
  protocolo: ProtocoloMeta;
  dfds: DfdIndexado[];
};

/** Texto (linhas reconstruídas) de UMA página — a entrada barata do índice. */
export type PaginaTexto = { page: number; lines: string[] };

const RE_NUM_DFD = /N[úu]mero\s+DFD\s*:?\s*(\d+)/i;

/** A página é a CAPA DO PROCESSO? (tem "CAPA DO PROCESSO" ou "Número Processo"). */
function ehCapa(lines: string[]): boolean {
  return lines.some((s) => /CAPA DO PROCESSO/i.test(s) || /N[úu]mero\s+Processo/i.test(s));
}

/** Texto por página a partir dos trechos crus (agrupa por página + reconstrói linhas). */
export function paginasDeItens(items: PdfItem[]): PaginaTexto[] {
  const porPagina = new Map<number, PdfItem[]>();
  for (const it of items) {
    const arr = porPagina.get(it.page) ?? [];
    arr.push(it);
    porPagina.set(it.page, arr);
  }
  return [...porPagina.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, its]) => ({ page, lines: linhasDeTexto(its) }));
}

/**
 * Classifica um PDF (pelas linhas por página) — separa as vias de importação e
 * recusa documento errado: **capa** OU **≥2 "Número DFD"** = protocolo; **1** DFD
 * sem capa = DFD avulso; **nenhum** sinal = desconhecido.
 */
export function classificarPdf(paginas: PaginaTexto[]): "protocolo" | "dfd" | "desconhecido" {
  const numeros = new Set<string>();
  let temCapa = false;
  for (const p of paginas) {
    const n = buscar(p.lines, RE_NUM_DFD);
    if (n) numeros.add(n);
    else if (ehCapa(p.lines)) temCapa = true;
  }
  if (temCapa || numeros.size >= 2) return "protocolo";
  if (numeros.size === 1) return "dfd";
  return "desconhecido";
}

/** Metadados da capa a partir das linhas de texto da página inicial. */
function extrairCapa(lines: string[], nomeArquivo: string): ProtocoloMeta {
  const numero = buscar(lines, /N[úu]mero\s+Processo\s*:?\s*([\d/]+)/i);
  const data = buscar(lines, /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)/);
  const interessado = buscar(lines, /Interessado\s*:?\s*(.+?)\s+CPF\/CNPJ\s*:/i);
  const documento = buscar(lines, /CPF\/CNPJ\s*:?\s*([\d./-]{11,})/i);
  const assunto = buscar(lines, /Assunto\s*:?\s*(.+)$/i);
  const observacao = buscar(lines, /Observa[çc][ãa]o\s*:?\s*(.+)$/i);
  // "Local repartição:" vem colado ao usuário (ex.: "luis.eduardo COMPRAS FMAS")
  // → remove o token de usuário ("nome.sobrenome") do início.
  const localBruto = buscar(lines, /Local\s+reparti[çc][ãa]o\s*:?\s*(.+)$/i);
  const localReparticao = localBruto ? localBruto.replace(/^\S+\.\S+\s+/, "").trim() || null : null;
  // "Valor" da capa (sem "R$", ex.: "32.705,00").
  const linhaValor = lines.find((s) => /Valor\s*:/i.test(s) && /\d[\d.]*,\d{2}/.test(s));
  const valorCapa = linhaValor ? parseNumberBR(linhaValor.match(/(\d[\d.]*,\d{2})/)?.[1] ?? null) : null;
  return { numero, data, interessado, documento, assunto, valorCapa, observacao, localReparticao, nomeArquivo };
}

/**
 * Índice leve do protocolo a partir do texto por página. Agrupa páginas
 * CONSECUTIVAS de mesmo "Número DFD" (os números não são monotônicos → por run) e
 * extrai só o cabeçalho de cada DFD. A capa é a 1ª página sem "Número DFD" que se
 * pareça com a capa do processo.
 */
export function indexarProtocolo(paginas: PaginaTexto[], nomeArquivo: string): ProtocoloIndex {
  const comNum = paginas.map((p) => ({ ...p, numero: buscar(p.lines, RE_NUM_DFD) }));

  let capaLines: string[] = [];
  for (const p of comNum) {
    if (p.numero == null && ehCapa(p.lines)) {
      capaLines = p.lines;
      break;
    }
  }

  const grupos: { numero: string; pages: number[]; lines: string[] }[] = [];
  let cur: { numero: string; pages: number[]; lines: string[] } | null = null;
  for (const p of comNum) {
    if (p.numero == null) {
      cur = null; // capa/separador encerra o run
      continue;
    }
    if (cur && cur.numero === p.numero) {
      cur.pages.push(p.page);
      cur.lines.push(...p.lines);
    } else {
      cur = { numero: p.numero, pages: [p.page], lines: [...p.lines] };
      grupos.push(cur);
    }
  }

  const dfds: DfdIndexado[] = grupos.map((g) => {
    const cab = extrairCabecalho(g.lines);
    return {
      numero: g.numero,
      pages: g.pages,
      setorRequisitante: cab.setorRequisitante,
      siglaSetor: cab.siglaSetor,
      orgaoEntidade: cab.orgaoEntidade,
      objeto: cab.objeto,
    };
  });

  return { protocolo: extrairCapa(capaLines, nomeArquivo), dfds };
}
