// EDITOR VISUAL ("escreve como se vê") — a conversão entre o TEXTO FORMATADO gravado (o markdown restrito de
// `texto-formatado.ts`) e o HTML do editor. Puro (testado em tests/texto-rico.test.ts): o editor nunca grava HTML — o que
// sai é sempre o mesmo texto formatado que a leitura, o PDF e as outras telas já entendem. Colar de outro programa passa
// pelos dois conversores (só o que o formato conhece fica: títulos, parágrafos, listas, citação, separador, negrito,
// itálico, código e links http/https).

import { type Alinhamento, type Bloco, CSS_ALINHAMENTO, CSS_FONTE, type Fonte, type Inline, lerTextoFormatado, marcasBloco } from "./texto-formatado.ts";

export const escaparHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineHtml(f: Inline[]): string {
  return f
    .map((n) => {
      switch (n.t) {
        case "texto":
          return escaparHtml(n.v);
        case "quebra":
          return "<br>";
        case "negrito":
          return `<strong>${inlineHtml(n.f)}</strong>`;
        case "italico":
          return `<em>${inlineHtml(n.f)}</em>`;
        case "codigo":
          return `<code>${escaparHtml(n.v)}</code>`;
        case "link":
          return `<a href="${escaparHtml(n.href)}">${inlineHtml(n.f)}</a>`;
        case "mencao":
          return escaparHtml(n.v);
        default:
          return "";
      }
    })
    .join("");
}

/** O atributo de estilo do alinhamento ("" à esquerda). */
const estiloAl = (al: Alinhamento | undefined, fo?: Fonte) => {
  const css = [al && al !== "esquerda" ? `text-align:${CSS_ALINHAMENTO[al]}` : "", fo && fo !== "sans" ? `font-family:${CSS_FONTE[fo].replace(/"/g, "'")}` : ""].filter(Boolean);
  return css.length ? ` style="${css.join(";")}"` : "";
};

function blocoHtml(b: Bloco): string {
  switch (b.t) {
    case "par":
      return `<p${estiloAl(b.al, b.fo)}>${inlineHtml(b.f) || "<br>"}</p>`;
    case "titulo":
      return `<h${b.n}${estiloAl(b.al, b.fo)}>${inlineHtml(b.f)}</h${b.n}>`;
    case "lista": {
      const tag = b.ordenada ? "ol" : "ul";
      const inicio = b.ordenada && b.inicio && b.inicio !== 1 ? ` start="${b.inicio}"` : "";
      return `<${tag}${inicio}${estiloAl(b.al, b.fo)}>${b.itens.map((i) => `<li>${inlineHtml(i) || "<br>"}</li>`).join("")}</${tag}>`;
    }
    case "citacao":
      return `<blockquote${estiloAl(b.al, b.fo)}>${inlineHtml(b.f)}</blockquote>`;
    case "separador":
      return "<hr>";
  }
}

/** O texto formatado → o HTML do editor (em partes de até ~18 mil caracteres, cortadas nas linhas em branco — o leitor
 * lê 20 mil por vez). Vazio = um parágrafo vazio (o cursor tem onde ficar). */
export function htmlDoTexto(texto: string): string {
  const partes: string[] = [];
  let atual = "";
  for (const bloco of texto.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    if (atual && atual.length + bloco.length > 18_000) {
      partes.push(atual);
      atual = "";
    }
    atual = atual ? `${atual}\n\n${bloco}` : bloco;
  }
  if (atual) partes.push(atual);
  const html = partes.flatMap((p) => lerTextoFormatado(p)).map(blocoHtml).join("");
  return html || "<p><br></p>";
}

/** O mínimo de um nó do DOM que a conversão usa (o editor passa o DOM real; os testes, uma árvore simples). */
export type NoRico = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<NoRico>;
  getAttribute?: (nome: string) => string | null;
};

const BLOCOS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "PRE", "SECTION", "ARTICLE", "TABLE", "TR"]);
const filhos = (n: NoRico) => Array.from(n.childNodes);
const ehBloco = (n: NoRico) => n.nodeType === 1 && BLOCOS.has(n.nodeName.toUpperCase());

/** Põe a marca em volta do texto, deixando os espaços das pontas DE FORA (`** x**` não seria lido como negrito). */
function envolver(dentro: string, marca: string): string {
  return dentro
    .split("\n")
    .map((linha) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(linha);
      if (!m?.[2]) return linha;
      return `${m[1]}${marca}${m[2]}${marca}${m[3]}`;
    })
    .join("\n");
}

/** O texto de um trecho em linha (negrito, itálico, código, link, quebras). */
function inline(n: NoRico): string {
  if (n.nodeType === 3) return (n.textContent ?? "").replace(/\u200b/g, "").replace(/\u00a0/g, " ").replace(/[\r\n\t]+/g, " ");
  if (n.nodeType !== 1) return "";
  const nome = n.nodeName.toUpperCase();
  if (nome === "BR") return "\n";
  const dentro = () => filhos(n).map(inline).join("");
  switch (nome) {
    case "STRONG":
    case "B":
      // O Google Docs envolve TUDO num <b style="font-weight:normal"> — não é negrito.
      if (/font-weight:\s*(normal|[1-5]00)\b/i.test(n.getAttribute?.("style") ?? "")) return dentro();
      return envolver(dentro(), "**");
    case "EM":
    case "I":
      // "_" (e não "*"): colado a um negrito ("**a**_b_") continua sem ambiguidade.
      return envolver(dentro(), "_");
    case "CODE": {
      const t = (n.textContent ?? "").replace(/[`\n]/g, " ").trim();
      return t ? `\`${t}\`` : "";
    }
    case "A": {
      const href = n.getAttribute?.("href") ?? "";
      const t = dentro().replace(/\n/g, " ").trim();
      if (!/^https?:\/\/[^\s<>"]+$/i.test(href)) return t;
      return t && t !== href ? `[${t.replace(/[[\]]/g, "")}](${href})` : href;
    }
    case "SCRIPT":
    case "STYLE":
      return "";
    default:
      return dentro();
  }
}

/** As linhas de um bloco de texto (sem espaços sobrando nas pontas; linhas vazias fora). */
const linhasDe = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** Um item de lista com listas dentro: o texto do item + os itens das listas internas (achatadas). */
function itensDoLi(li: NoRico): string[] {
  const proprio: string[] = [];
  const internos: string[] = [];
  for (const f of filhos(li)) {
    const nome = f.nodeName.toUpperCase();
    if (f.nodeType === 1 && (nome === "UL" || nome === "OL")) {
      for (const l of filhos(f)) if (l.nodeName.toUpperCase() === "LI") internos.push(...itensDoLi(l));
    } else proprio.push(ehBloco(f) ? `${inline(f)} ` : inline(f));
  }
  const texto = linhasDe(proprio.join("")).join(" ");
  return [...(texto ? [texto] : []), ...internos];
}

type TipoNumeracao = "decimal" | "romano" | "romano-min" | "letra" | "letra-min";

/** A numeração de uma lista colada: o `type` ("I", "i", "A", "a") ou o `list-style-type` (da lista ou do 1º item). */
function tipoDaNumeracao(ol: NoRico, li?: NoRico): TipoNumeracao {
  const tipo = ol.getAttribute?.("type") ?? "";
  const estilo = `${ol.getAttribute?.("style") ?? ""};${li?.getAttribute?.("style") ?? ""}`.toLowerCase();
  if (tipo === "I" || estilo.includes("upper-roman")) return "romano";
  if (tipo === "i" || estilo.includes("lower-roman")) return "romano-min";
  if (tipo === "A" || estilo.includes("upper-alpha") || estilo.includes("upper-latin")) return "letra";
  if (tipo === "a" || estilo.includes("lower-alpha") || estilo.includes("lower-latin")) return "letra-min";
  return "decimal";
}

/** "I." / "iv." / "a)" — o rótulo do n-ésimo item. */
function rotuloItem(tipo: TipoNumeracao, n: number): string {
  if (tipo === "letra" || tipo === "letra-min") {
    let s = "";
    for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
    return `${tipo === "letra" ? s.toUpperCase() : s})`;
  }
  const tabela: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let resto = n;
  let s = "";
  for (const [v, r] of tabela) {
    while (resto >= v) {
      s += r;
      resto -= v;
    }
  }
  return `${tipo === "romano" ? s : s.toLowerCase()}.`;
}

/** O alinhamento de um elemento (o `text-align` do estilo ou o atributo `align` — o editor e o colado de outros programas). */
export function alinhamentoDe(n: NoRico): Alinhamento | undefined {
  if (n.nodeType !== 1) return undefined;
  const estilo = /text-align\s*:\s*([a-z-]+)/i.exec(n.getAttribute?.("style") ?? "")?.[1] ?? n.getAttribute?.("align") ?? "";
  switch (estilo.toLowerCase()) {
    case "center":
      return "centro";
    case "right":
    case "end":
      return "direita";
    case "justify":
      return "justificado";
    case "left":
    case "start":
      return "esquerda";
    default:
      return undefined;
  }
}

/** A FONTE de um elemento (o `font-family` do estilo — o editor, o Word, o Docs): serifada, de máquina ou a do sistema.
 * Um elemento cujo texto está todo num único filho com a fonte (o <span> do Word/Docs) também vale. */
export function fonteDe(n: NoRico): Fonte | undefined {
  if (n.nodeType !== 1) return undefined;
  const fam = /font-family\s*:\s*([^;]+)/i.exec(n.getAttribute?.("style") ?? "")?.[1] ?? n.getAttribute?.("face") ?? "";
  if (fam) return fonteDaFamilia(fam);
  const fs = filhos(n).filter((f) => f.nodeType === 1 || (f.textContent ?? "").trim());
  return fs.length === 1 && fs[0].nodeType === 1 && !ehBloco(fs[0]) ? fonteDe(fs[0]) : undefined;
}
/** A família de fontes → o grupo: "Times New Roman"/"Georgia"/"Cambria"… = serif; "Courier"/"Consolas"… = mono. */
export function fonteDaFamilia(fam: string): Fonte | undefined {
  const f = fam.toLowerCase().split(",")[0].replace(/["']/g, "").trim();
  if (!f || f === "inherit") return undefined;
  if (/mono|courier|consolas|menlo|monaco|lucida console/.test(f)) return "mono";
  if (/^serif$|times|georgia|cambria|garamond|book antiqua|palatino|baskerville|constantia|didot|merriweather|lora|playfair|ui-serif/.test(f)) return "serif";
  return "sans";
}

/** Os blocos (texto formatado) de um nó do editor; `herdado` = o alinhamento do bloco de fora (um <div> alinhado). */
function blocos(n: NoRico, out: string[], herdado?: Alinhamento, fonteHerdada?: Fonte) {
  let pendente = "";
  const marcar = (texto: string, f?: NoRico | Alinhamento, fo?: Fonte) =>
    `${marcasBloco((typeof f === "string" ? f : f && alinhamentoDe(f)) ?? herdado, fo ?? (f && typeof f !== "string" ? fonteDe(f) : undefined) ?? fonteHerdada)}${texto}`;
  const fecharPendente = () => {
    const ls = linhasDe(pendente);
    if (ls.length) out.push(marcar(ls.join("\n")));
    pendente = "";
  };
  for (const f of filhos(n)) {
    if (!ehBloco(f)) {
      pendente += inline(f);
      continue;
    }
    fecharPendente();
    const nome = f.nodeName.toUpperCase();
    if (/^H[1-6]$/.test(nome)) {
      const t = linhasDe(inline(f)).join(" ");
      if (t) out.push(marcar(`${"#".repeat(Math.min(3, Number(nome[1])))} ${t}`, f));
    } else if (nome === "UL" || nome === "OL") {
      const itens = filhos(f)
        .filter((l) => l.nodeName.toUpperCase() === "LI")
        .flatMap(itensDoLi);
      const inicio = Math.max(1, Math.min(999, Number.parseInt(f.getAttribute?.("start") ?? "1", 10) || 1));
      const lis = filhos(f).filter((l) => l.nodeName.toUpperCase() === "LI");
      const li = lis[0];
      // Alinhamento da lista: o do <ol>/<ul>, senão o dos itens quando TODOS têm o mesmo (o do 1º sozinho não vale).
      const alItens = lis.map((l) => alinhamentoDe(l) ?? alinhamentoDe(filhos(l).find(ehBloco) ?? l));
      const alLista = alinhamentoDe(f) ?? (alItens.every((a) => a === alItens[0]) ? alItens[0] : undefined);
      const foItens = lis.map((l) => fonteDe(l));
      const foLista = fonteDe(f) ?? (foItens.every((a) => a === foItens[0]) ? foItens[0] : undefined);
      const tipo = nome === "OL" ? tipoDaNumeracao(f, li) : "decimal";
      if (itens.length && tipo !== "decimal") {
        // Romanos e letras (colados de outro programa) ficam como estão escritos — "I.", "a)" —, um parágrafo por item.
        for (const [i, t] of itens.entries()) out.push(marcar(`${rotuloItem(tipo, inicio + i)} ${t}`, alItens[i] ?? alLista, fonteDe(lis[i]) ?? foLista));
      } else if (itens.length) out.push(marcar(itens.map((t, i) => (nome === "OL" ? `${inicio + i}. ${t}` : `- ${t}`)).join("\n"), alLista, foLista));
    } else if (nome === "BLOCKQUOTE") {
      const dentro: string[] = [];
      blocos(f, dentro);
      const ls = dentro.join("\n").split("\n").filter((l) => l.trim());
      if (ls.length) out.push(marcar(ls.map((l) => `> ${l.replace(/^(\[\[\w+\]\]\s?)*>\s?/, "")}`).join("\n"), f));
    } else if (nome === "HR") {
      out.push("---");
    } else if (filhos(f).some(ehBloco)) {
      blocos(f, out, alinhamentoDe(f) ?? herdado, fonteDe(f) ?? fonteHerdada);
    } else {
      const ls = linhasDe(inline(f));
      if (ls.length) out.push(marcar(ls.join("\n"), f));
    }
  }
  fecharPendente();
}

/** O HTML do editor (o nó raiz) → o texto formatado gravado. */
export function textoDoHtml(raiz: NoRico): string {
  const out: string[] = [];
  blocos(raiz, out);
  return out.join("\n\n");
}

/** O estilo do bloco em que o cursor está (o seletor "Parágrafo · Título 1/2/3 · Citação"). */
export const ESTILOS_BLOCO = [
  { valor: "p", rotulo: "Texto normal" },
  { valor: "h1", rotulo: "Título 1" },
  { valor: "h2", rotulo: "Título 2" },
  { valor: "h3", rotulo: "Título 3" },
  { valor: "blockquote", rotulo: "Citação" },
] as const;
export type EstiloBloco = (typeof ESTILOS_BLOCO)[number]["valor"];

/** O valor do `queryCommandValue("formatBlock")` (varia por navegador: "h1", "<h1>", "div", "") → o estilo. */
export function estiloDoBloco(v: string): EstiloBloco {
  const t = v.toLowerCase().replace(/[<>]/g, "");
  return t === "h1" || t === "h2" || t === "h3" || t === "blockquote" ? t : "p";
}

const RE_INICIO_ESTRUTURA = /^(?:#{1,3}\s|[-*•]\s|>|\d{1,3}(?:\.\d{1,3})*[.)]\s|[IVXLC]{1,6}[.)\-–]\s|[a-z][)]\s|\[\[)/;
const RE_TITULO_NUMERADO = /^\d{1,2}[.)]\s+\p{Lu}[^\n]{0,86}$/u;
const RE_TITULO_PALAVRA = /^(?:CAP[IÍ]TULO|SE[CÇ][AÃ]O|ANEXO|T[IÍ]TULO)\b/u;

/** A linha é um TÍTULO de seção? "1. Objeto e aceitação", "CAPÍTULO II", uma linha curta toda em maiúsculas — sem
 * pontuação de fim de frase (".;:," — "1. Este termo vale." é um item, não um título). */
export function pareceTitulo(linha: string): boolean {
  const s = linha.trim();
  if (!s || s.length > 90 || /[.;:,]$/.test(s)) return false;
  if (RE_TITULO_NUMERADO.test(s) || RE_TITULO_PALAVRA.test(s)) return true;
  const letras = s.replace(/[^\p{L}]/gu, "");
  return letras.length >= 4 && letras === letras.toLocaleUpperCase("pt-BR") && s.split(/\s+/).length <= 10;
}

/**
 * ORGANIZA o texto COLADO (de um documento, PDF, e-mail…): no texto SEM formatação (`plano`), as linhas quebradas pela
 * largura voltam a ser um parágrafo — a quebra fica onde a frase termina ou onde começa um item ("1.1.", "I.", "a)", "-");
 * em qualquer origem, os blocos de UMA linha que são títulos de seção viram Título 2 (só num texto com 3+ blocos — uma
 * mensagem curta não vira título). O número dos itens fica como escrito (a lista numerada guarda o começo).
 */
export function organizarColado(texto: string, plano: boolean, titulos = true): string {
  const linhas = texto.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n");
  const blocos: string[][] = [];
  let atual: string[] = [];
  const fechar = () => {
    if (atual.length) blocos.push(atual);
    atual = [];
  };
  for (const bruta of linhas) {
    const l = plano ? bruta.replace(/[ \t]+/g, " ").trim() : bruta.trimEnd();
    if (!l.trim()) {
      fechar();
      continue;
    }
    if (plano && atual.length) {
      const ant = atual[atual.length - 1];
      const quebraReal = /[.;:!?)"”]$/.test(ant) || RE_INICIO_ESTRUTURA.test(l) || pareceTitulo(ant) || pareceTitulo(l);
      if (quebraReal) {
        fechar();
        atual.push(l);
      } else atual[atual.length - 1] = /-$/.test(ant) && /^\p{Ll}/u.test(l) ? `${ant.slice(0, -1)}${l}` : `${ant} ${l}`;
      continue;
    }
    // Colado COM formatação: a quebra (<br>) no meio de uma frase — a seguinte começa em minúscula — foi da largura.
    if (!plano && atual.length) {
      const ant = atual[atual.length - 1];
      if (!/[.;:!?)"”]$/.test(ant) && /^\p{Ll}/u.test(l) && !RE_INICIO_ESTRUTURA.test(ant) && !RE_INICIO_ESTRUTURA.test(l)) {
        atual[atual.length - 1] = /-$/.test(ant) ? `${ant.slice(0, -1)}${l}` : `${ant} ${l}`;
        continue;
      }
    }
    atual.push(l);
  }
  fechar();
  const comTitulos = titulos && blocos.length >= 3;
  // TUDO em negrito (o colado de um título, de um "<b>" que envolve o documento): o negrito não é ênfase — sai dos
  // parágrafos inteiros quando mais da metade deles vem assim.
  const RE_MARCAS = /^(?:\[\[\w+\]\]\s?)*/;
  const inteiroNegrito = (l: string) => /^\*\*[^*]+\*\*$/.test(l.slice(RE_MARCAS.exec(l)?.[0].length ?? 0).trim());
  const pars = blocos.filter((b) => b.length === 1 && !/^(#|>|[-*•]\s|---)/.test(b[0].replace(RE_MARCAS, "")));
  if (pars.length >= 2 && pars.filter((b) => inteiroNegrito(b[0])).length * 2 > pars.length)
    for (const b of blocos)
      for (const [i, l] of b.entries()) if (inteiroNegrito(l)) b[i] = l.replace(/\*\*([^*]+)\*\*\s*$/, "$1");
  return blocos
    .map((b) => {
      // Título com o negrito dentro ("## **1. Objeto**") — o título já é negrito.
      if (b.length === 1 && /^(?:\[\[\w+\]\]\s?)*#{1,3}\s+\*\*[^*]+\*\*$/.test(b[0].trim())) b[0] = b[0].replace(/\*\*([^*]+)\*\*/, "$1");
      if (comTitulos && b.length === 1) {
        const marca = RE_MARCAS.exec(b[0])?.[0] ?? "";
        let resto = b[0].slice(marca.length);
        // O título colado do Word/Docs vem em negrito ("**1. Objeto**").
        const neg = /^\*\*([^*]+)\*\*$/.exec(resto.trim());
        if (neg) resto = neg[1];
        if (!/^(#|>|[-*•]\s)/.test(resto) && pareceTitulo(resto)) return `${marca}## ${resto.trim()}`;
      }
      return b.join("\n");
    })
    .join("\n\n");
}
