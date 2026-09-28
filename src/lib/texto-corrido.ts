import { stripAccents } from "./normalize.ts";

/**
 * TEXTO CORRIDO — refaz os PARÁGRAFOS de um texto capturado LINHA A LINHA. No PDF cada linha VISUAL vira uma linha
 * (e o texto gravado antes desta regra ficou assim): "…MONITORAMENTO REMOTO NO⏎DEPARTAMENTO…" — a quebra é só a
 * LARGURA da linha, não do texto. A quebra FICA quando é real — fim de frase, item de lista, rótulo ("Nome:"), bloco
 * novo (vão maior que a entrelinha), linha curta — e SOME (vira um espaço) quando é da largura: palavra de ligação no
 * fim ("…PARA GARANTIR A"), a seguinte continua a frase (minúscula, "E", "DE"…) ou a linha vai até a margem direita.
 * Na dúvida, a quebra FICA (nunca junta o que não tem evidência). Idempotente. Puro/testável.
 */

/** Geometria de uma linha do PDF: página, `y` da base, início/fim em `x` e o corpo da fonte. */
export type GeoLinha = { page: number; y: number; x0: number; x1: number; h: number };
/** Uma linha capturada (com a geometria, no PDF). */
export type LinhaCorrida = { texto: string; geo?: GeoLinha };
/**
 * Evidência de LARGURA: `direita` = a margem direita do documento (PDF — a linha que chega perto dela está CHEIA);
 * `largura` = a largura da linha visual em CARACTERES (texto sem geometria — `larguraVisual`). Sem nenhuma, só as
 * pistas do texto decidem.
 */
export type OpcoesCorrido = { direita?: number | null; largura?: number | null };

/** Linha CHEIA: ocupa ao menos esta fração do espaço até a margem direita (a quebra foi da largura). */
const FRACAO_CHEIA = 0.75;
/** Vão entre as bases de duas linhas acima deste múltiplo do corpo da fonte = BLOCO novo (entrelinha ≈ 1,15×). */
const VAO_BLOCO = 1.4;
/** Largura visual mínima (caracteres) para valer como evidência — uma linha curta de ligação não mede a página. */
const LARGURA_MINIMA = 50;

// Palavras de LIGAÇÃO que terminam uma linha só quando a frase continua na seguinte (maiúsculas, COM acento: "É", o
// verbo, não é o "E" conjunção).
const LIGACAO_FIM = new Set(
  (
    "E OU NEM MAS DE DA DO DAS DOS EM NA NO NAS NOS A À O AS ÀS OS AO AOS UM UMA UNS UMAS COM SEM POR PELO PELA PELOS " +
    "PELAS PARA PRA SOBRE SOB ENTRE ATÉ ATE APÓS APOS DESDE CONTRA PERANTE CONFORME MEDIANTE QUE SE COMO CUJO CUJA CUJOS " +
    "CUJAS ONDE QUANDO NUM NUMA DUM DUMA DESTE DESTA DESTES DESTAS DESSE DESSA DESSES DESSAS NESTE NESTA NESSE NESSA " +
    "SEU SUA SEUS SUAS Nº N°"
  ).split(" "),
);
// Palavras que, no INÍCIO da linha, continuam a frase anterior (artigos ficam de fora: parágrafo começa com "A…").
const LIGACAO_INICIO = new Set(
  "E OU DE DA DO DAS DOS NA NO NAS NOS AO AOS À ÀS PELO PELA PELOS PELAS QUE CUJO CUJA CUJOS CUJAS".split(" "),
);
// Abreviações que terminam em ponto sem terminar a frase ("SEC.", "CONT.", "MUNIC.", "LTDA.").
const ABREVIACOES = new Set(
  (
    "SEC SECR CONT MUNIC MUN ART ARTS INC INCS PAR PARAG LTDA SR SRA SRS DR DRA PROF PROFA AV NR NRO NUM PP PAG PAGS " +
    "FL FLS TEC ADM DEPTO DEPT DEP DIR COORD SUPERINT SUPERV ASSIST FUND APROX MAT MATR EX OBS REF REFS UNID UN UND " +
    "QTD QTDE QUANT VL VLR EST FED GOV PREF SEG SERV ESP ESPEC AUX TEL CEL ENG GAB INST ASSOC CIA DIV"
  ).split(" "),
);

// Marcador de lista (sempre abre linha): bolinha, quadrado, losango, seta, visto…
const RE_MARCADOR = /^[•◦▪▫■□●○◆◇❖➢➤►▶▸‣⁃✓✔☐☑⦿⧫∙·]/u;
// Item de lista/enumeração: "- item", "a) item", "1. item", "1.2 item", "1 - item", "II - item", "§ 1º".
const RE_ITEM =
  /^(?:[-–—*]\s|\(?[a-z]\)\s|[A-Z]\)\s|\d{1,3}(?:\.\d{1,3})*[.)]\s|\d{1,3}(?:\.\d{1,3})+\s|\d{1,3}\s?[-–—]\s|[IVX]{1,5}\s?[-–—)]\s|§)/u;
// Rótulo de campo em Título ("Nome:", "Matrícula:", "Responsável Fiscalização:") — até 4 palavras antes dos ":".
const RE_ROTULO = /^\p{Lu}\p{Ll}[\p{L}\p{M}ºª°./-]*(?:\s+[\p{L}\p{M}ºª°./-]+){0,3}\s*:(?:\s|$)/u;
// Pontuação de ligação no fim: vírgula, barra, "(", "+", "&" ou um traço SEPARADOR (" -").
const RE_LIGACAO_PONTUACAO = /(?:[,/(+&]|\s[-–—])$/u;
// Palavra hifenizada na quebra ("AR-" ⏎ "CONDICIONADO"): junta SEM espaço.
const RE_HIFEN_COLADO = /\p{L}-$/u;
// Fim de frase: . ! ? ; : … (com aspas/parênteses de fechamento depois).
const RE_FIM_FRASE = /[.!?;:…]["'”’»)\]]*$/u;
// Palavra (só letras) logo antes do ponto final — p/ reconhecer a abreviação.
const RE_PALAVRA_PONTO = /(?:^|[^\p{L}])(\p{L}+)\.["'”’»)\]]*$/u;

const semAcento = (s: string) => stripAccents(s).toUpperCase();
const ultimaPalavra = (s: string) => s.split(/\s+/).pop() ?? "";
const primeiraPalavra = (s: string) => s.split(/\s+/, 1)[0] ?? "";

/** A linha termina numa LIGAÇÃO (palavra ou pontuação) — a frase continua na seguinte. */
export function terminaEmLigacao(linha: string): boolean {
  const t = linha.trim();
  if (!t) return false;
  if (RE_LIGACAO_PONTUACAO.test(t) || RE_HIFEN_COLADO.test(t)) return true;
  return LIGACAO_FIM.has(ultimaPalavra(t).toUpperCase());
}

/** A linha termina uma FRASE (. ! ? ; : …) — um ponto de ABREVIAÇÃO ("SEC.", "LTDA.", uma inicial "J.") não conta. */
export function terminaFrase(linha: string): boolean {
  const t = linha.trim();
  if (!RE_FIM_FRASE.test(t)) return false;
  const abrev = t.match(RE_PALAVRA_PONTO)?.[1];
  return !(abrev && (abrev.length === 1 || ABREVIACOES.has(semAcento(abrev))));
}

/** A linha ABRE um item: marcador de lista, enumeração ou rótulo de campo. */
function inicioMarcado(linha: string): boolean {
  return RE_MARCADOR.test(linha) || RE_ITEM.test(linha) || RE_ROTULO.test(linha);
}

/** A linha começa CONTINUANDO a frase anterior: minúscula ou palavra de ligação ("E", "DE", "DA"…). */
function comecaContinuando(linha: string): boolean {
  if (/^\p{Ll}/u.test(linha)) return true;
  return LIGACAO_INICIO.has(primeiraPalavra(linha).toUpperCase());
}

/**
 * A quebra entre a linha `a` e a `b` é REAL (fica)? `cheia` = a linha `a` ia até a margem direita (evidência de
 * largura; `undefined` = sem evidência — na dúvida, fica). `lista` = o parágrafo de `a` abriu com um marcador/rótulo
 * (um "- item" seguinte é o próximo item, não a continuação de um traço separador).
 */
export function quebraFica(a: string, b: string, cheia: boolean | undefined, lista = false): boolean {
  if (RE_MARCADOR.test(b)) return true;
  if (lista && (RE_ITEM.test(b) || RE_ROTULO.test(b))) return true; // o próximo item da lista / campo
  if (terminaEmLigacao(a)) return false;
  if (terminaFrase(a)) return true;
  if (comecaContinuando(b)) return false;
  return cheia !== true;
}

/** Bloco NOVO pela geometria: na mesma página, a base desceu mais que a entrelinha (ou a linha subiu — outra coluna). */
function novoBloco(a: GeoLinha | undefined, b: GeoLinha | undefined): boolean {
  if (!a || !b || a.page !== b.page) return false;
  const corpo = Math.max(a.h, b.h);
  if (!(corpo > 0)) return false; // sem o corpo da fonte, a geometria não decide
  const vao = a.y - b.y;
  return vao <= 0 || vao > VAO_BLOCO * corpo;
}

/** A linha `a` está CHEIA (a quebra depois dela foi da largura) — pela geometria ou pelo nº de caracteres. */
function linhaCheia(a: LinhaCorrida, opts: OpcoesCorrido): boolean | undefined {
  if (a.geo && opts.direita != null) {
    const espaco = opts.direita - a.geo.x0;
    return espaco > 1 ? a.geo.x1 - a.geo.x0 >= FRACAO_CHEIA * espaco : undefined;
  }
  if (opts.largura != null) {
    const n = a.texto.trim().length;
    // Bem mais longa que a linha visual = já é um parágrafo (texto corrido) — não conta como linha cheia.
    return n >= FRACAO_CHEIA * opts.largura && n <= opts.largura * 1.25;
  }
  return undefined;
}

/**
 * Junta as linhas em TEXTO CORRIDO: parágrafos separados por "\n" (e uma linha em branco preservada como "\n\n").
 * As linhas vazias entre as capturadas separam parágrafos.
 */
export function textoCorrido(linhas: ReadonlyArray<LinhaCorrida>, opts: OpcoesCorrido = {}): string {
  let out = "";
  let ant: LinhaCorrida | null = null;
  let lista = false;
  let branco = false;
  for (const l of linhas) {
    const t = l.texto.trim();
    if (!t) {
      branco = ant != null;
      continue;
    }
    const atual: LinhaCorrida = { texto: t, geo: l.geo };
    if (!ant) {
      out = t;
      lista = inicioMarcado(t);
    } else if (branco || novoBloco(ant.geo, l.geo) || quebraFica(ant.texto, t, linhaCheia(ant, opts), lista)) {
      out += `${branco ? "\n\n" : "\n"}${t}`;
      lista = inicioMarcado(t);
    } else {
      out += `${RE_HIFEN_COLADO.test(ant.texto) ? "" : " "}${t}`;
    }
    ant = atual;
    branco = false;
  }
  return out;
}

/**
 * Largura da linha VISUAL (em caracteres) de textos capturados linha a linha sem geometria (o texto gravado): a da
 * maior linha que termina numa LIGAÇÃO seguida de continuação — essas quebras são, com certeza, da largura. `null`
 * sem evidência (texto já corrido ou digitado) — aí só as pistas do texto decidem, e o resultado não muda de novo.
 */
export function larguraVisual(textos: ReadonlyArray<string | null | undefined>): number | null {
  let max = 0;
  for (const texto of textos) {
    const ls = String(texto ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim());
    for (let i = 0; i + 1 < ls.length; i++) {
      const [a, b] = [ls[i], ls[i + 1]];
      if (a && b && !RE_MARCADOR.test(b) && terminaEmLigacao(a)) max = Math.max(max, a.length);
    }
  }
  return max >= LARGURA_MINIMA ? max : null;
}

/** TEXTO CORRIDO de um texto já gravado/digitado (quebras "\n"): `largura` = a de `larguraVisual` (padrão: a dele). */
export function refluirTexto(texto: string, largura: number | null = larguraVisual([texto])): string {
  return textoCorrido(
    String(texto ?? "")
      .split(/\r?\n/)
      .map((t) => ({ texto: t })),
    { largura },
  );
}
