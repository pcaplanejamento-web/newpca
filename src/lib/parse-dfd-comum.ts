import { limparTexto, stripAccents } from "./normalize.ts";

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
  /** Origem do item numa SOBRESCRITA com escolha ("g:3" = item 3 do gravado; "n:5" = item 5 do arquivo
   * novo) — só na tela, para a escolha reencontrar o item; NUNCA é gravado (`semMarcas`). */
  ref?: string;
};

/** Título canônico da Seção 4 (tabela de itens); usado p/ o texto de apoio dela. */
export const TITULO_SECAO_ITENS = "QUANTIDADE DE MATERIAL/SERVIÇOS A SER CONTRATADA";

/**
 * Código curto do TIPO do DFD (`DFD-S`/`DFD-R`/`DFD-O`/`DFD-E`) a partir do texto
 * completo do tipo (ex.: "DFD-S — Solução / com ETP" → "DFD-S"). `null` se não casar.
 * É uma das informações mais importantes do DFD (mostrada no cabeçalho).
 */
export function tipoCurtoDfd(tipo: string | null | undefined): string | null {
  const m = String(tipo ?? "").match(/DFD-([SROE])\b/i);
  return m ? `DFD-${m[1].toUpperCase()}` : null;
}

/**
 * Ano do PCA a partir de um texto (capa/observação/assunto do protocolo ou seções do
 * DFD): "PCA 2027", "PCA DE 2027", "PCA/2027", "PLANO DE CONTRATAÇÕES ANUAL … 2027".
 * `null` se não encontrar. Usado para ADIVINHAR o PCA (o usuário confirma/escolhe).
 */
export function anoPcaDoTexto(texto: string | null | undefined): number | null {
  const s = String(texto ?? "");
  // "PCA 2027", "PCA/2027", "PCA DE 2027", "PCA DO ANO DE 2027" (o ano pode quebrar de
  // linha — ex.: "...NO PCA DO ANO DE\n2027") → tolerância maior no vão entre "PCA" e o
  // ano (só conectores/espaços/quebra: "DO ANO DE"), sem casar dígitos no meio.
  const m =
    s.match(/\bPCA\b[^0-9]{0,16}((?:19|20)\d{2})/i) ??
    s.match(/PLANO\s+DE\s+CONTRATA[ÇC][ÕO]ES\s+ANUAL[^0-9]{0,24}((?:19|20)\d{2})/i);
  const ano = m ? Number(m[1]) : null;
  return ano != null && ano >= 2000 && ano <= 2100 ? ano : null;
}

// Um nº de referência ("860/2025", "123.456/2024") e a CONTINUAÇÃO de uma lista ("…Nº 860/2025, 861/2025 e
// Nº 3/2026") — o plural da palavra-chave ("CONTRATOS", "ATAS", "PREGÕES"…) também casa.
const NUM_REF = "[0-9][0-9./-]*";
const LISTA_REF = String.raw`${NUM_REF}(?:\s*(?:,|;|\bE\b)\s*(?:N[º°O.]*\s*)?${NUM_REF})*`;
const RE_CONTRATO = new RegExp(String.raw`\bCONTRATOS?\b[^0-9]{0,6}(${LISTA_REF})`, "gi");
const RE_ATA = new RegExp(String.raw`\b(?:ATAS?(?:\s+DE\s+REGISTRO\s+DE\s+PRE[ÇC]OS)?|ARPS?)\b[^0-9]{0,6}(${LISTA_REF})`, "gi");
const RE_LICITACAO = new RegExp(
  String.raw`\b(?:LICITA[ÇC](?:[ÃA]O|[ÕO]ES)|PREG(?:[ÃA]O|[ÕO]ES)(?:\s+ELETR[ÔO]NICOS?)?|CONCORR[ÊE]NCIAS?|TOMADAS?\s+DE\s+PRE[ÇC]OS|PROCESSOS?\s+LICITAT[ÓO]RIOS?)\b[^0-9]{0,6}(${LISTA_REF})`,
  "gi",
);

/** Separador canônico de VÁRIAS referências no mesmo campo (um DFD-R pode ter vários contratos/ARPs/
 * licitações): "860/2025; 861/2025". O campo continua texto (sem migração); um valor único segue igual. */
export const SEPARADOR_REFS = "; ";

/** As referências de um campo (texto com "; " ou ",") → lista limpa, sem vazios nem repetidas. Puro. */
export function listaRefs(v: string | null | undefined): string[] {
  const out: string[] = [];
  for (const parte of String(v ?? "").split(/\s*[;,]\s*/)) {
    const r = parte.replace(/\s+/g, " ").trim();
    if (r && !out.some((x) => x.toUpperCase() === r.toUpperCase())) out.push(r);
  }
  return out;
}

/** Lista de referências → o texto do campo ("a; b"), ou `null` sem nenhuma. Puro. */
export function juntarRefs(l: (string | null | undefined)[]): string | null {
  return listaRefs(l.filter(Boolean).join(SEPARADOR_REFS)).join(SEPARADOR_REFS) || null;
}

/** Uma DATA (dd/mm/aaaa) — nunca é nº de referência. */
const RE_DATA_REF = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

/** TODAS as referências de um tipo no texto (cada menção e cada item de uma lista). Numa lista, os itens
 * seguintes só entram no formato nº/ano ("/") do 1º — "Nº 860/2025, 12 MESES" não vira o contrato "12"; data
 * nunca entra. Entre menções, vale o nº/ano: um nº solto de OUTRA frase ("PRORROGAÇÃO DO CONTRATO POR 12
 * MESES", "ATA DE 2024") é descartado quando há algum nº/ano; sem nenhum nº/ano, fica só a 1ª menção. */
function extrairRefs(s: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(re)) {
    const itens = m[1].split(/\s*(?:,|;|\bE\b)\s*(?:N[º°O.]*\s*)?/i).map((x) => x.replace(/[.\-/]+$/, "").trim());
    const comBarra = itens[0]?.includes("/");
    itens.forEach((n, k) => {
      if (!n || RE_DATA_REF.test(n) || (k > 0 && (!comBarra || !n.includes("/")))) return; // solto / data / fora do formato
      if (!out.includes(n)) out.push(n);
    });
  }
  return out.some((n) => n.includes("/")) ? out.filter((n) => n.includes("/")) : out.slice(0, 1);
}

/**
 * Referências de RENOVAÇÃO (DFD-R) num texto: nº(s) de **contrato**, **ata** (de registro de
 * preços) e **licitação** (pregão/concorrência/processo licitatório) — TODAS as mencionadas, juntas por
 * "; " (`SEPARADOR_REFS`). Cada uma `null` se não achar. Todo DFD-R deveria mencionar ao menos uma
 * (senão vira AVISO, não bloqueia).
 */
export function referenciasRenovacao(texto: string | null | undefined): {
  contrato: string | null;
  ata: string | null;
  licitacao: string | null;
} {
  const s = String(texto ?? "");
  return {
    contrato: juntarRefs(extrairRefs(s, RE_CONTRATO)),
    ata: juntarRefs(extrairRefs(s, RE_ATA)),
    licitacao: juntarRefs(extrairRefs(s, RE_LICITACAO)),
  };
}

/**
 * Uma assinatura lida do PDF do DFD. QUATRO formatos:
 * - **certificado**: "Assinaturas Digitais (Certificado Digital)" → "Assinatura
 *   digital - Nome: … e-Assinatura: <código>";
 * - **sistema**: "Assinaturas Eletrônicas (Sistema)" → "Assinado digitalmente por
 *   NOME, portador do CPF: … utilizando o código: <código>";
 * - **dropsigner**: Dropsigner (Lacuna Software) — o bloco visível costuma ser a APARÊNCIA de
 *   uma ANOTAÇÃO de assinatura (widget `Sig`), extraída do TEXTO RENDERIZADO (`getOperatorList`)
 *   por `assinaturasDropsignerDeTexto` (`parse-dfd-pdf-core.ts`); o `getTextContent` NÃO a traz.
 *   O código vem na URL `dropsigner.com/validate/<código>` (marca d'água). `url` = link de validação.
 * - **adobe**: Adobe/ICP-Brasil (PAdES) — aparência INLINE "Assinado de forma digital por NOME:CPF
 *   Dados: AAAA.MM.DD …", lida do texto renderizado por `assinaturasAdobeDeTexto`. Sem `codigo`/`url`
 *   público (a prova é o certificado ICP-Brasil; validação no ITI).
 * - **foxit**: Foxit/ICP-Brasil (e-CPF) ACHATADA como IMAGEM (Formato E) — sem camada de texto e sem
 *   `/Sig` cripto, então NENHUM parser de texto a lê; é obtida por **OCR** da região do carimbo (só no
 *   navegador, `ocr-assinatura.ts`) → `assinaturasFoxitDeTexto`. Como o OCR é imperfeito, uma `foxit`
 *   que não casa um responsável é reconhecida SEM bloquear (ver `validarAssinatura`). Sem `codigo`/`url`.
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
  fonte: "certificado" | "sistema" | "dropsigner" | "adobe" | "foxit" | "manual";
  /** `true` quando a assinatura foi LIDA POR OCR (carimbo achatado, sem camada de texto) — imperfeita,
   * então não bloqueia quando o nome não casa (`validarAssinatura`) e o card avisa. Ausente = texto. */
  ocr?: boolean;
  /** Validação MANUAL pela EQUIPE: o usuário conferiu o PDF e atestou que o `responsavel` (da unidade)
   * assinou. `usuario`/`em` são carimbados pelo SERVIDOR (quem validou e quando). A validação
   * automática (o sistema casou o assinante) não é gravada — é recalculada ("auto"). */
  validacao?: ValidacaoEquipe;
};

export type ValidacaoEquipe = { por: "equipe"; responsavel: string; usuario?: string; em?: string };

/** Coage a validação crua (JSON do banco) — só `por:"equipe"` com responsável. */
export function coerceValidacao(v: unknown): ValidacaoEquipe | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const responsavel = typeof o.responsavel === "string" ? o.responsavel.trim() : "";
  if (o.por !== "equipe" || !responsavel) return undefined;
  const out: ValidacaoEquipe = { por: "equipe", responsavel };
  if (typeof o.usuario === "string" && o.usuario) out.usuario = o.usuario;
  if (typeof o.em === "string" && o.em) out.em = o.em;
  return out;
}

/** As `fonte`s de assinatura válidas (fonte única — reusada pela coerção ao LER o JSON do banco). */
export const FONTES_ASSINATURA = ["certificado", "sistema", "dropsigner", "adobe", "foxit", "manual"] as const;

/** Coage um valor CRU (JSON do banco, não confiável) para uma `fonte` válida — whitelist das 5 fontes,
 * com fallback seguro em "certificado". Fonte ÚNICA da normalização (evita esquecer um caso ao ler do
 * D1, como aconteceu com "foxit"); testável sem `getDb`. */
export function coerceFonte(v: unknown): Assinatura["fonte"] {
  return (FONTES_ASSINATURA as readonly string[]).includes(v as string) ? (v as Assinatura["fonte"]) : "certificado";
}

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
  anoPca: number | null; // ano do PCA adivinhado (o usuário confirma/escolhe)
  numeroContrato: string | null; // referência de renovação (DFD-R)
  numeroAta: string | null;
  numeroLicitacao: string | null;
  valorTotal: number | null;
  nomeArquivo: string;
  secoes: DfdSecao[];
  itens: DfdItemParseado[];
  assinaturas: Assinatura[];
};

/** Adivinha o ano do PCA e as referências de renovação (DFD-R) do texto do DFD (objeto +
 * seções). Reusado pelos parsers `.xlsx`/`.pdf`. */
export function extrairRefsDfd(
  secoes: DfdSecao[],
  objeto: string | null,
): { anoPca: number | null; numeroContrato: string | null; numeroAta: string | null; numeroLicitacao: string | null } {
  const texto = [objeto ?? "", ...secoes.map((s) => s.texto)].join("\n");
  const r = referenciasRenovacao(texto);
  return { anoPca: anoPcaDoTexto(texto), numeroContrato: r.contrato, numeroAta: r.ata, numeroLicitacao: r.licitacao };
}

/** UPPER + sem acento + espaços colapsados (p/ casar rótulos/cabeçalhos). */
export function norm(v: unknown): string {
  return stripAccents(
    String(v ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase(),
  );
}

/**
 * `norm` + **remove pontuação** (só letras/números/espaço) — para COMPARAR textos
 * ignorando pontuação, espaços e tabs (ex.: item do DFD × item do catálogo). Mantém
 * `²`/`³` (via `\p{N}`). NÃO usar para detecção de rótulos/cabeçalhos (use `norm`).
 */
export function normComparacao(v: unknown): string {
  return norm(v)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function txt(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

// Marcadores de LISTA/decorativos que o requisitante cola do Word no meio da descrição do item ("…SUSTENTAÇÃO;
// • DIMENSÕES…", seta, visto, quadrado, losango…) — NÃO são conteúdo do item: • ‣ ⁃ ∙, Formas Geométricas
// (U+25A0–25FF), estrelas/caixas de seleção, Dingbats (U+2700–2775 e U+2794–27BF) e os círculos/quadrados de
// U+2981, U+29BE–29BF, U+2B1B–2B1C, U+2B24–2B2F. O marcador em fonte Symbol/Wingdings (uso privado, U+F0B7) já chega
// como "•" por `limparTexto`. Ficam: setas (→), "§", "°", "²", "®" e os números circulados (U+2776–2793).
const RE_MARCADOR_LISTA =
  /[\u2022\u2023\u2043\u2219\u25A0-\u25FF\u2605\u2606\u2610-\u2612\u26AA\u26AB\u2700-\u2775\u2794-\u27BF\u2981\u29BE\u29BF\u2B1B\u2B1C\u2B24-\u2B2F]/gu;

/**
 * DESCRIÇÃO do item como deve ser guardada: texto limpo (`limparTexto` — tabs, quebras, NBSP e invisíveis viram
 * um espaço; o marcador em fonte de símbolo vira "•") SEM os marcadores de lista (cada um vira um espaço) e
 * sem o "·" solto usado como marcador. Idempotente. Puro.
 */
export function limparDescricaoItem(v: unknown): string {
  return limparTexto(v)
    .replace(RE_MARCADOR_LISTA, " ")
    .replace(/(^|\s)\u00B7(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * CÓDIGO do item: só os DÍGITOS, na ordem (o código quebrado em 2 linhas — "524194727" ⏎ "0" — ou com
 * espaço/TAB/pontuação no meio vira "5241947270"); os ZEROS À ESQUERDA são preservados (é texto, nunca
 * número). Dígitos de largura total/sobrescritos viram ASCII (NFKC). Sem dígito ⇒ `null`. Puro.
 */
export function codigoDoItem(v: unknown): string | null {
  const d = limparTexto(v).normalize("NFKC").replace(/\D/g, "");
  return d || null;
}

/**
 * Número de uma célula do DFD (quantidade/valores) em pt-BR — como `parseNumberBR`, mas sem o erro do
 * separador ÚNICO de milhar: "1.000"/"12.500.000" (só ponto, grupos de 3) é MILHAR (1000), não 1,0. Vírgula =
 * decimal ("12,0000"); com ponto E vírgula, o último separador é o decimal; várias vírgulas sem ponto = milhar
 * en-US. Número já numérico (célula da planilha) passa direto. Sem dígito ⇒ `null`. Puro.
 */
export function numeroDfd(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = limparTexto(v).normalize("NFKC").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const negativo = /^-/.test(s);
  s = s.replace(/-/g, "");
  const pontos = (s.match(/\./g) ?? []).length;
  const virgulas = (s.match(/,/g) ?? []).length;
  if (pontos > 0 && virgulas > 0) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgulas > 0) {
    s = virgulas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (pontos > 0 && /^[1-9]\d{0,2}(?:\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  } else if (pontos > 1) {
    return null; // "1.2.3": ambíguo — nunca inventa um valor
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

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
    // Rodapé do Centi ("Centi ® e-Assinatura: … Emitido em dd/mm/aaaa … Página N de M"). Casados com a FORMA
    // do rodapé — só o prefixo derrubava linhas legítimas ("CENTÍMETROS DE ALTURA", "PÁGINAS…", "EMITIDO EM
    // DUAS VIAS").
    /^CENTI\b/.test(n) ||
    /^EMITIDO EM \d/.test(n) ||
    /^EMITIDO POR [\w.@-]*[._@\d][\w.@-]*(?:\s|$)/.test(n) || // "Emitido por fernanda.mello" (usuário do sistema)
    /^PAGINA \d+ (?:DE|\/) \d+/.test(n) ||
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
    n.startsWith("ASSINADO ELETRONICAMENTE") ||
    // Aparência da assinatura Adobe/ICP-Brasil ("Assinado de forma digital por …") — capturada por
    // `assinaturasAdobeDeTexto`; não deve vazar para o texto das seções. Só no INÍCIO da linha: prosa que
    // cita "assinado de forma digital" no meio da frase é texto do DFD (a aparência sobre o texto é
    // retirada por trecho antes, em `limparAssinaturasDoTexto`).
    n.startsWith("ASSINADO DE FORMA DIGITAL") ||
    n.includes("E-ASSINATURA") ||
    n.includes("UTILIZANDO O CODIGO") ||
    n.includes("AUTENTICACAORELATORIOS") ||
    // Marca d'água do Dropsigner (repetida por página) — capturada por `assinaturasDropsignerDeTexto`.
    n.includes("DOCUMENTO ASSINADO NO DROPSIGNER") ||
    n.includes("DROPSIGNER.COM/VALIDATE")
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
  };
}

/**
 * Os TÍTULOS PADRONIZADOS das seções do DFD (o formulário é sempre o mesmo). Casados pelo INÍCIO do
 * título normalizado — o NÚMERO pode variar entre modelos (ex.: um DFD sem a seção de prioridade
 * numera "6 - FUNDAMENTAÇÃO LEGAL"), mas o título não. Só um destes títulos abre uma seção: uma linha
 * de ITEM cuja descrição começa com "- " ("29 - SEC. DE ASSISTÊNCIA…") NUNCA vira "seção".
 */
export const SECOES_PADRAO: { chave: string; re: RegExp }[] = [
  { chave: "area", re: /^AREA REQUISITANTE/ },
  { chave: "identificacao", re: /^IDENTIFICACAO DA DEMANDA/ },
  { chave: "justificativa", re: /^JUSTIFICATIVA/ },
  { chave: "quantidade", re: /^QUANTIDADE DE (MATERIA|SERVI)/ },
  { chave: "previsao", re: /^PREVISAO DE (ENTREGA|EXECU)/ },
  { chave: "prioridade", re: /^PRIORIDADE/ },
  { chave: "fundamentacao", re: /^FUNDAMENTACAO/ },
  { chave: "equipe", re: /^INDICACAO D/ },
  { chave: "demandante", re: /^(SECRETARI[OA]|GESTOR[A]?|ORDENADOR[A]?)( MUNICIPAL)? DEMANDANTE/ },
  { chave: "autorizacao", re: /^AUTORIZACAO/ },
];

/** Linha "N - TÍTULO" com um título PADRONIZADO → {numero, titulo, chave}; senão `null`. Puro. */
export function tituloSecaoPadrao(linha: string): { numero: number; titulo: string; chave: string } | null {
  const m = String(linha ?? "").trim().match(/^(\d{1,2})\s*[-–—]\s*(.+)$/);
  if (!m) return null;
  const t = norm(m[2]);
  const p = SECOES_PADRAO.find((x) => x.re.test(t));
  return p ? { numero: Number(m[1]), titulo: m[2].trim(), chave: p.chave } : null;
}

/**
 * Coleta as SEÇÕES ("N - TÍTULO" + texto). Recebe a lista de "linhas iniciais" (1ª célula da linha no
 * `.xlsx` / texto da linha no `.pdf`). Só um TÍTULO PADRONIZADO (`SECOES_PADRAO`) abre seção — qualquer
 * outra linha "N - …" é texto da seção corrente (não cria seções indeterminadamente). Pula a área
 * requisitante (vira campos) e a tabela de itens, e ignora o ruído de página.
 */
export function coletarSecoes(leadings: string[]): DfdSecao[] {
  const brutas: { numero: number; titulo: string; chave: string; linhas: string[] }[] = [];
  let atual: { numero: number; titulo: string; chave: string; linhas: string[] } | null = null;
  for (const cell of leadings) {
    if (!cell) continue;
    const t = tituloSecaoPadrao(cell);
    if (t) {
      atual = { ...t, linhas: [] };
      brutas.push(atual);
      continue;
    }
    if (atual && !ehRuido(cell)) atual.linhas.push(cell);
  }
  return brutas
    .filter((s) => s.chave !== "area" && s.chave !== "quantidade")
    .map((s) => ({ numero: s.numero, titulo: s.titulo, texto: s.linhas.join("\n").trim() }))
    .filter((s) => s.texto.length > 0);
}
