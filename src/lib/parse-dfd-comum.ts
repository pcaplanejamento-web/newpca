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

/** Título canônico da Seção 4 (tabela de itens); usado p/ o texto de apoio dela. */
export const TITULO_SECAO_ITENS = "QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA";

/**
 * Uma assinatura lida das páginas que seguem cada DFD no PDF. Dois formatos:
 * - **certificado**: "Assinaturas Digitais (Certificado Digital)" → "Assinatura
 *   digital - Nome: … e-Assinatura: <código>";
 * - **sistema**: "Assinaturas Eletrônicas (Sistema)" → "Assinado digitalmente por
 *   NOME, portador do CPF: … utilizando o código: <código>".
 * O `codigo` é o verificador usado no site oficial; `data` é crua; `ip`/`usuario`/
 * `local` podem vir vazios (o formato "sistema" não os traz). Pode haver mais de
 * uma assinatura por página e em páginas diferentes, sempre após o DFD.
 */
export type Assinatura = {
  nome: string;
  eCpf: string;
  usuario: string;
  local: string;
  data: string;
  ip: string;
  codigo: string;
  url: string;
  fonte: "certificado" | "sistema";
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
  assinaturas: Assinatura[];
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
    n.startsWith("EMITIDO POR") ||
    n.startsWith("PAGINA ") ||
    n === "ESTADO DE GOIAS" ||
    n === "PREFEITURA MUNICIPAL DE RIO VERDE" ||
    n.startsWith("DOCUMENTO DE FORMALIZACAO") ||
    /NUMERO DFD/.test(n) ||
    n.startsWith("TIPO DFD") ||
    // Páginas de assinatura (capturadas à parte por `extrairAssinaturas`) — não
    // devem vazar para o texto das seções no fluxo avulso. Dois formatos:
    n.startsWith("ASSINATURA DIGITAL") ||
    n.startsWith("ASSINATURAS DIGITAIS") ||
    n.startsWith("ASSINATURAS ELETRONICAS") ||
    n.startsWith("ASSINADO DIGITALMENTE") ||
    n.includes("E-ASSINATURA") ||
    n.includes("UTILIZANDO O CODIGO") ||
    n.includes("AUTENTICACAORELATORIOS")
  );
}

/**
 * Regex de UMA assinatura digital. Casa a linha "Assinatura digital - Nome: …" até
 * o "e-Assinatura: <código> - <url>". Global (várias assinaturas por página) e
 * tolerante ao IP vazio; roda sobre o texto ORIGINAL (preserva o caixa do nome e
 * do código). Grupos: 1 nome, 2 e-CPF, 3 usuário, 4 local, 5 data, 6 IP, 7 código,
 * 8 URL.
 */
// Formato A — "Assinatura digital - Nome: … e-Assinatura: <código> - <url>".
// Grupos: 1 nome, 2 e-CPF, 3 usuário, 4 local, 5 data, 6 IP, 7 código, 8 URL.
// `IP:\s*([\d.]*)` = IP só dígitos/pontos (não engole o "e-" quando o IP vem vazio);
// `e-?\s*Assinatura:` tolera o rótulo quebrado em 2 linhas ("IP: e-" + "Assinatura: …").
const RE_ASSINATURA_A =
  /Assinatura\s+digital\s*-\s*Nome:\s*(.+?)\s+e-?CPF:\s*(\S+)\s+Usu[aá]rio:\s*(\S+)\s+Local:\s*(.*?)\s+Data:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s+IP:\s*([\d.]*)\s*e-?\s*Assinatura:\s*(\S+?)\s*-\s*(https?:\/\/\S+)/gi;

// Formato B — "Assinaturas Eletrônicas (Sistema)": "Assinado digitalmente por NOME,
// portador do CPF: CPF, em DATA. Validar autenticidade em: …/COD - utilizando o
// código: COD". Grupos: 1 nome, 2 CPF, 3 data, 4 código (o "utilizando o código:"
// é o mais confiável; a ponte `[^]*?` tolera a URL/quebra entre a data e o código).
const RE_ASSINATURA_B =
  /Assinado digitalmente por\s+(.+?),\s*portador do CPF:\s*([\d.*-]+),?\s*em\s+(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)[\s\S]*?utilizando o c[oó]digo:\s*(\S+)/gi;

/**
 * Extrai TODAS as assinaturas (formatos "certificado" e "sistema") das páginas que
 * seguem o DFD. Junta as linhas num único texto (código/URL costumam quebrar de
 * linha) e casa cada assinatura. Puro/testável.
 */
export function extrairAssinaturas(linhas: string[]): Assinatura[] {
  const texto = linhas.join(" ");
  const out: Assinatura[] = [];

  RE_ASSINATURA_A.lastIndex = 0;
  let m: RegExpExecArray | null = RE_ASSINATURA_A.exec(texto);
  while (m !== null) {
    out.push({
      nome: m[1].trim(),
      eCpf: m[2].trim(),
      usuario: m[3].trim(),
      local: m[4].trim(),
      data: m[5].trim(),
      ip: m[6].trim(),
      codigo: m[7].trim(),
      url: m[8].trim(),
      fonte: "certificado",
    });
    m = RE_ASSINATURA_A.exec(texto);
  }

  RE_ASSINATURA_B.lastIndex = 0;
  let b: RegExpExecArray | null = RE_ASSINATURA_B.exec(texto);
  while (b !== null) {
    out.push({
      nome: b[1].trim(),
      eCpf: b[2].trim(),
      usuario: "",
      local: "",
      data: b[3].trim(),
      ip: "",
      codigo: b[4].trim(),
      url: "",
      fonte: "sistema",
    });
    b = RE_ASSINATURA_B.exec(texto);
  }
  return out;
}

/**
 * Números FALTANDO na sequência interna dos itens (de `min` a `max`). **Buracos são
 * NORMAIS** — itens removidos/fracassados pulam o número (ex.: 8, 10, 11…) e os
 * códigos seguem sequenciais; isso **NÃO é perda nem erro**, só um apontamento
 * informativo. A leitura multipágina já varre TODAS as páginas do DFD (sem `break`
 * que trunque), então todo item presente é lido. Puro/testável.
 */
export function buracosSequencia(itens: DfdItemParseado[]): number[] {
  const nums = itens
    .map((i) => i.item)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (nums.length < 2) return [];
  const uniq = new Set(nums);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const out: number[] = [];
  for (let i = min; i <= max; i++) if (!uniq.has(i)) out.push(i);
  return out;
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
  // para antes de um rótulo seguinte na mesma linha (ex.: "... Data: 31/08/2026")
  // p/ não vazar valor no Setor — igual ao Responsável parar antes de "Matrícula".
  const setorRequisitante = buscar(
    linhas,
    /Setor\s+Requisitante\s*:?\s*(.+?)(?:\s+Data\s*:|$)/i,
  );
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
