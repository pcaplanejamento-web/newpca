import { parseNumberBR } from "./normalize.ts";
import { buscar, type DfdParseado } from "./parse-dfd-comum.ts";
import { linhasDeTexto, type PdfItem, parseDfdFromPdfItems } from "./parse-dfd-pdf-core.ts";

/**
 * Núcleo PURO do parser de PROTOCOLO em PDF — o "processo" administrativo que
 * empacota VÁRIOS DFDs. Recebe os trechos de texto com posição (`{page,x,y,str}`)
 * já extraídos pelo pdf.js (ver `parse-protocolo-pdf.ts`) e:
 *  - detecta o "Número DFD" de cada página (mesma regex do cabeçalho do DFD) e
 *    agrupa páginas CONSECUTIVAS de mesmo número → 1 DFD (páginas de "Assinaturas
 *    Digitais" e a capa não têm Número DFD e servem de separador);
 *  - reaproveita `parseDfdFromPdfItems` por grupo (validado no PDF real) —
 *    capturando erro POR DFD para não derrubar os demais;
 *  - extrai os metadados da CAPA DO PROCESSO (Número Processo, Interessado,
 *    CPF/CNPJ, Assunto, Valor, Observação, Local repartição) via `buscar`.
 * Sem pdf.js/D1 aqui → testável no Node com trechos sintéticos.
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
  nomeArquivo: string;
};

export type ProtocoloDfdErro = { ordem: number; numero: string | null; erro: string };

export type ProtocoloParseado = {
  protocolo: ProtocoloMeta;
  dfds: DfdParseado[];
  erros: ProtocoloDfdErro[];
};

const RE_NUM_DFD = /N[úu]mero\s+DFD\s*:?\s*(\d+)/i;

/** A página é a CAPA DO PROCESSO? (tem "CAPA DO PROCESSO" ou "Número Processo"). */
function ehCapa(lines: string[]): boolean {
  return lines.some((s) => /CAPA DO PROCESSO/i.test(s) || /N[úu]mero\s+Processo/i.test(s));
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

export function parseProtocoloFromPdfItems(bruto: PdfItem[], nomeArquivo: string): ProtocoloParseado {
  // Trechos por página, na ordem das páginas.
  const porPagina = new Map<number, PdfItem[]>();
  for (const it of bruto) {
    const arr = porPagina.get(it.page) ?? [];
    arr.push(it);
    porPagina.set(it.page, arr);
  }
  const paginas = [...porPagina.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, items]) => {
      const lines = linhasDeTexto(items);
      return { page, items, numero: buscar(lines, RE_NUM_DFD), lines };
    });

  // Capa = 1ª página sem "Número DFD" que se pareça com a capa do processo.
  let capaLines: string[] = [];
  for (const p of paginas) {
    if (p.numero == null && ehCapa(p.lines)) {
      capaLines = p.lines;
      break;
    }
  }

  // Fatia em RUNS de páginas consecutivas com o mesmo "Número DFD" (os números
  // não são monotônicos → agrupar por run, não por valor).
  const grupos: { numero: string; items: PdfItem[] }[] = [];
  let cur: { numero: string; items: PdfItem[] } | null = null;
  for (const p of paginas) {
    if (p.numero == null) {
      cur = null; // capa/separador encerra o run atual
      continue;
    }
    if (cur && cur.numero === p.numero) cur.items.push(...p.items);
    else {
      cur = { numero: p.numero, items: [...p.items] };
      grupos.push(cur);
    }
  }

  // Cada DFD reaproveita o core do DFD; erro fica isolado por DFD.
  const dfds: DfdParseado[] = [];
  const erros: ProtocoloDfdErro[] = [];
  grupos.forEach((g, i) => {
    try {
      dfds.push(parseDfdFromPdfItems(g.items, nomeArquivo));
    } catch (e) {
      erros.push({
        ordem: i + 1,
        numero: g.numero,
        erro: e instanceof Error ? e.message : "Falha ao ler o DFD.",
      });
    }
  });

  return { protocolo: extrairCapa(capaLines, nomeArquivo), dfds, erros };
}
