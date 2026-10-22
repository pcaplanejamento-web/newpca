// EDITOR VISUAL ("escreve como se vê") — a conversão entre o TEXTO FORMATADO gravado (o markdown restrito de
// `texto-formatado.ts`) e o HTML do editor. Puro (testado em tests/texto-rico.test.ts): o editor nunca grava HTML — o que
// sai é sempre o mesmo texto formatado que a leitura, o PDF e as outras telas já entendem. Colar de outro programa passa
// pelos dois conversores (só o que o formato conhece fica: títulos, parágrafos, listas, citação, separador, negrito,
// itálico, código e links http/https).

import { type Bloco, type Inline, lerTextoFormatado } from "./texto-formatado.ts";

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

function blocoHtml(b: Bloco): string {
  switch (b.t) {
    case "par":
      return `<p>${inlineHtml(b.f) || "<br>"}</p>`;
    case "titulo":
      return `<h${b.n}>${inlineHtml(b.f)}</h${b.n}>`;
    case "lista": {
      const tag = b.ordenada ? "ol" : "ul";
      return `<${tag}>${b.itens.map((i) => `<li>${inlineHtml(i) || "<br>"}</li>`).join("")}</${tag}>`;
    }
    case "citacao":
      return `<blockquote>${inlineHtml(b.f)}</blockquote>`;
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

/** Os blocos (texto formatado) de um nó do editor. */
function blocos(n: NoRico, out: string[]) {
  let pendente = "";
  const fecharPendente = () => {
    const ls = linhasDe(pendente);
    if (ls.length) out.push(ls.join("\n"));
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
      if (t) out.push(`${"#".repeat(Math.min(3, Number(nome[1])))} ${t}`);
    } else if (nome === "UL" || nome === "OL") {
      const itens = filhos(f)
        .filter((l) => l.nodeName.toUpperCase() === "LI")
        .flatMap(itensDoLi);
      if (itens.length) out.push(itens.map((t, i) => (nome === "OL" ? `${i + 1}. ${t}` : `- ${t}`)).join("\n"));
    } else if (nome === "BLOCKQUOTE") {
      const dentro: string[] = [];
      blocos(f, dentro);
      const ls = dentro.join("\n").split("\n").filter((l) => l.trim());
      if (ls.length) out.push(ls.map((l) => `> ${l.replace(/^>\s?/, "")}`).join("\n"));
    } else if (nome === "HR") {
      out.push("---");
    } else if (filhos(f).some(ehBloco)) {
      blocos(f, out);
    } else {
      const ls = linhasDe(inline(f));
      if (ls.length) out.push(ls.join("\n"));
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
