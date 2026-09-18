import { parseNumberBR } from "./normalize.ts";
import { anoPcaDoTexto, type Assinatura, buscar, extrairAssinaturas, extrairCabecalho, norm } from "./parse-dfd-comum.ts";
import { agruparLinhas, linhasDeTexto, normalizar, type PdfItem } from "./parse-dfd-pdf-core.ts";

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
  idExterno: string | null; // "Id:" da capa (ex.: "2273524")
  anoPca: number | null; // ano do PCA adivinhado da capa (usuário confirma/escolhe)
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
  /** Assinaturas da página que segue o DFD (capturadas já no índice — o parse
   * completo só lê `pages`, sem a página de assinatura). */
  assinaturas: Assinatura[];
};

export type ProtocoloIndex = {
  protocolo: ProtocoloMeta;
  dfds: DfdIndexado[];
};

/** Texto (linhas reconstruídas) de UMA página — a entrada barata do índice. Os `items`
 * (geometria) só são preenchidos na página da CAPA (1 pág) → extração coluna-aware dos
 * campos multi-linha, sem guardar a geometria das demais páginas (memória O(nº DFDs)). */
export type PaginaTexto = { page: number; lines: string[]; items?: PdfItem[] };

const RE_NUM_DFD = /N[úu]mero\s+DFD\s*:?\s*(\d+)/i;

/** A página é a CAPA DO PROCESSO? (tem "CAPA DO PROCESSO" ou "Número Processo"). */
export function ehCapa(lines: string[]): boolean {
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
    .map(([page, its]) => {
      const lines = linhasDeTexto(its);
      // Guarda a geometria SÓ da capa (extração coluna-aware dos campos multi-linha).
      return ehCapa(lines) ? { page, lines, items: its } : { page, lines };
    });
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

/** Campos da coluna esquerda da capa (rótulo → valor, multi-linha). */
type CamposCapa = Partial<
  Record<
    "numero" | "interessado" | "endereco" | "email" | "cidade" | "solicitante" | "assunto" | "dataDocumento" | "observacao" | "usuario",
    string
  >
>;
// Rótulos da capa na COLUNA ESQUERDA (comparados via `norm` — sem acento, UPPER). Cada um
// abre um campo cujo valor segue até o PRÓXIMO rótulo (podendo quebrar em várias linhas).
const ROTULOS_CAPA: { re: RegExp; chave: keyof CamposCapa }[] = [
  { re: /^NUMERO\s+PROCESSO\b/, chave: "numero" },
  { re: /^INTERESSADO\b/, chave: "interessado" },
  { re: /^ENDERECO\b/, chave: "endereco" },
  { re: /^E-?MAIL\b/, chave: "email" },
  { re: /^CIDADE\b/, chave: "cidade" },
  { re: /^SOLICITANTE\b/, chave: "solicitante" },
  { re: /^ASSUNTO\b/, chave: "assunto" },
  { re: /^DATA\s+DOCUMENTO\b/, chave: "dataDocumento" },
  { re: /^OBSERVACAO\b/, chave: "observacao" },
  { re: /^USUARIO\b/, chave: "usuario" },
];
// Rótulo da coluna DIREITA embutido na mesma linha → corta o valor a partir dele.
const CORTE_DIREITA_CAPA = /\s+(?:CPF\/CNPJ|TELEFONE|BAIRRO|DATA\s*\/?\s*HORA|\bId\b|VALOR|N[úu]mero do documento)\s*:.*/i;
const RUIDO_CAPA = /(?:e-?assinatura|emitido em|p[áa]gina\s+\d+\s+de\s+\d+|centi\s*®)/i;

/**
 * Campos da capa POR GEOMETRIA (coluna-aware) — resolve valores MULTI-LINHA que quebram
 * sem serem cortados por um rótulo da coluna direita numa linha própria no MEIO (ex.:
 * `CPF/CNPJ:` entre `Interessado:` e sua continuação `E GESTÃO DE CUSTOS`). Uma linha da
 * coluna ESQUERDA que começa com um rótulo conhecido abre um campo; uma linha esquerda SEM
 * rótulo é continuação (wrap) do campo corrente; uma linha só da coluna DIREITA é pulada
 * (não muda o campo). Rodapé/assinatura são descartados. Puro/testável.
 */
export function camposCapa(items: PdfItem[]): CamposCapa {
  const linhas = agruparLinhas(normalizar(items));
  if (linhas.length === 0) return {};
  const minX = (l: (typeof linhas)[number]) => Math.min(...l.items.map((i) => i.x));
  const baseLeft = Math.min(...linhas.map(minX));
  const LIMIAR = baseLeft + 90; // coluna esquerda (rótulos + wraps indentados) vs direita
  const campos: CamposCapa = {};
  let cur: keyof CamposCapa | null = null;
  for (const l of linhas) {
    const texto = l.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
    if (!texto || RUIDO_CAPA.test(texto)) continue;
    if (minX(l) > LIMIAR) continue; // linha só da coluna direita → não muda o campo
    const rot = ROTULOS_CAPA.find((r) => r.re.test(norm(texto)));
    if (rot) {
      campos[rot.chave] = texto.replace(/^[^:]*:\s*/, "").split(CORTE_DIREITA_CAPA)[0].trim();
      cur = rot.chave;
    } else if (cur) {
      campos[cur] = `${campos[cur] ? `${campos[cur]} ` : ""}${texto}`.trim();
    }
  }
  return campos;
}

/**
 * Metadados da capa. Com a GEOMETRIA da capa (`capaItems`), os campos que podem QUEBRAR em
 * várias linhas (interessado/assunto/observacao) vêm do `camposCapa` coluna-aware (não
 * truncam); sem geometria (caminho Node/testes) cai no regex de 1 linha. Os demais campos
 * (numero/id/data/valor/documento/local) são de 1 linha → seguem no regex.
 */
function extrairCapa(lines: string[], capaItems: PdfItem[] | undefined, nomeArquivo: string): ProtocoloMeta {
  const campos = capaItems ? camposCapa(capaItems) : null;
  const numero = buscar(lines, /N[úu]mero\s+Processo\s*:?\s*([\d/]+)/i);
  // "Id:" da capa (ex.: "...Data /Hora: Id: 2273524 22/06/2026..."); ≥3 dígitos p/
  // não casar rótulos soltos.
  const idExterno = buscar(lines, /\bId\s*:\s*(\d{3,})/i);
  const data = buscar(lines, /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)/);
  const interessado = campos?.interessado || buscar(lines, /Interessado\s*:?\s*(.+?)\s+CPF\/CNPJ\s*:/i);
  const documento = buscar(lines, /CPF\/CNPJ\s*:?\s*([\d./-]{11,})/i);
  const assunto = campos?.assunto || buscar(lines, /Assunto\s*:?\s*(.+)$/i);
  const observacao = campos?.observacao || buscar(lines, /Observa[çc][ãa]o\s*:?\s*(.+)$/i);
  // "Local repartição:" vem colado ao usuário (ex.: "luis.eduardo COMPRAS FMAS")
  // → remove o token de usuário ("nome.sobrenome") do início.
  const localBruto = buscar(lines, /Local\s+reparti[çc][ãa]o\s*:?\s*(.+)$/i);
  const localReparticao = localBruto ? localBruto.replace(/^\S+\.\S+\s+/, "").trim() || null : null;
  // "Valor" da capa (sem "R$", ex.: "32.705,00").
  const linhaValor = lines.find((s) => /Valor\s*:/i.test(s) && /\d[\d.]*,\d{2}/.test(s));
  const valorCapa = linhaValor ? parseNumberBR(linhaValor.match(/(\d[\d.]*,\d{2})/)?.[1] ?? null) : null;
  // Ano do PCA da capa (ex.: observação "...PCA DE 2027") — adivinha, o usuário confirma.
  const anoPca = anoPcaDoTexto(lines.join(" \n "));
  return { numero, idExterno, anoPca, data, interessado: interessado || null, documento, assunto: assunto || null, valorCapa, observacao: observacao || null, localReparticao, nomeArquivo };
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
  let capaItems: PdfItem[] | undefined;
  for (const p of comNum) {
    if (p.numero == null && ehCapa(p.lines)) {
      capaLines = p.lines;
      capaItems = p.items; // geometria da capa (para os campos multi-linha)
      break;
    }
  }

  type Grupo = { numero: string; pages: number[]; lines: string[]; assinaturas: Assinatura[] };
  const grupos: Grupo[] = [];
  let cur: Grupo | null = null; // run de páginas contíguas do MESMO DFD
  let ultimoDfd: Grupo | null = null; // último DFD (recebe as assinaturas que o seguem)
  for (const p of comNum) {
    if (p.numero == null) {
      // Página separadora. A assinatura PADRÃO (certificado/sistema) do DFD só conta se estiver
      // na(s) página(s) IMEDIATAMENTE após o DFD — podem ser VÁRIAS páginas contíguas (um formato
      // por página), todas de assinatura, que acumulam (APPEND) no último DFD. Qualquer página
      // separadora SEM assinatura (capa, despacho, DECRETO, anexo, em branco) ENCERRA a janela: o
      // que vier depois já NÃO é do último DFD (senão a assinatura de um anexo grudava no DFD).
      cur = null;
      const ass = extrairAssinaturas(p.lines);
      if (ass.length > 0) {
        if (ultimoDfd) ultimoDfd.assinaturas.push(...ass);
      } else {
        ultimoDfd = null;
      }
      continue;
    }
    if (cur && cur.numero === p.numero) {
      cur.pages.push(p.page);
      cur.lines.push(...p.lines);
    } else {
      cur = { numero: p.numero, pages: [p.page], lines: [...p.lines], assinaturas: [] };
      grupos.push(cur);
    }
    ultimoDfd = cur;
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
      assinaturas: g.assinaturas,
    };
  });

  return { protocolo: extrairCapa(capaLines, capaItems, nomeArquivo), dfds };
}
