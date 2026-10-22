import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modeloTermo } from "../src/lib/termo-uso-core.ts";
import { estiloDoBloco, htmlDoTexto, type NoRico, textoDoHtml } from "../src/lib/texto-rico-core.ts";

// Um "DOM" mínimo para os testes: lê o HTML simples que o editor produz (tags, href, entidades).
type No = NoRico & { childNodes: No[] };
const tx = (s: string): No => ({ nodeType: 3, nodeName: "#text", textContent: s, childNodes: [] });
function el(nome: string, attrs: Record<string, string>, filhos: No[]): No {
  return {
    nodeType: 1,
    nodeName: nome.toUpperCase(),
    childNodes: filhos,
    get textContent() {
      return filhos.map((f) => f.textContent).join("");
    },
    getAttribute: (n) => attrs[n] ?? null,
  };
}
const VAZIOS = new Set(["br", "hr"]);
function parse(html: string): No {
  const raiz = el("div", {}, []);
  const pilha: No[] = [raiz];
  const des = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, "\u00a0").replace(/&amp;/g, "&");
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    const topo = pilha[pilha.length - 1];
    if (m[4] != null) topo.childNodes.push(tx(des(m[4])));
    else if (m[1]) pilha.pop();
    else {
      const attrs: Record<string, string> = {};
      for (const a of m[3].matchAll(/([a-z]+)="([^"]*)"/g)) attrs[a[1]] = des(a[2]);
      const n = el(m[2], attrs, []);
      topo.childNodes.push(n);
      if (!VAZIOS.has(m[2].toLowerCase())) pilha.push(n);
    }
  }
  return raiz;
}
const ida = (md: string) => textoDoHtml(parse(htmlDoTexto(md)));

describe("editor visual (texto ↔ HTML)", () => {
  it("o modelo do termo vai e volta IGUAL", () => {
    const m = modeloTermo("Plataforma PCA");
    assert.equal(ida(m), m);
  });
  it("cada formato vai e volta", () => {
    for (const md of [
      "# Título\n\nParágrafo com **negrito**, _itálico_, `código` e [link](https://x.gov.br).",
      "**forte**_junto_ e _ita_**neg**",
      "- um\n- dois\n\n1. primeiro\n2. segundo",
      "> citação\n> segunda linha\n\n---\n\nlinha 1\nlinha 2",
      "### Sub\n\n1.1. Item numerado no texto (não é lista).",
    ])
      assert.equal(ida(md), md);
  });
  it("o HTML colado vira só o que o formato conhece", () => {
    const colado = parse(
      '<h1>Título <span style="x">grande</span></h1><div><b>Neg </b>e <i>ita</i><br>linha</div><ul><li>a<ul><li>b</li></ul></li></ul><table><tr><td>célula</td></tr></table><p><a href="javascript:alert(1)">mal</a> <a href="https://ok.br">bom</a></p><script>x</script>',
    );
    assert.equal(textoDoHtml(colado), "# Título grande\n\n**Neg** e _ita_\nlinha\n\n- a\n- b\n\ncélula\n\nmal [bom](https://ok.br)");
  });
  it("texto solto, vazio e o HTML escapado", () => {
    assert.equal(textoDoHtml(parse("solto <b>aqui</b><p>par</p>")), "solto **aqui**\n\npar");
    assert.equal(htmlDoTexto(""), "<p><br></p>");
    assert.equal(htmlDoTexto("<script>"), "<p>&lt;script&gt;</p>");
    assert.equal(textoDoHtml(parse("<p><br></p>")), "");
  });
  it("o itálico gravado com * volta como _ (o mesmo itálico)", () => {
    assert.equal(ida("um *dois* três"), "um _dois_ três");
  });
  it("estilo do bloco", () => {
    assert.equal(estiloDoBloco("<H2>"), "h2");
    assert.equal(estiloDoBloco("div"), "p");
    assert.equal(estiloDoBloco("blockquote"), "blockquote");
  });
});
