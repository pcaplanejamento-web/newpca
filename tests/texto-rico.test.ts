import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modeloTermo } from "../src/lib/termo-uso-core.ts";
import { lerTextoFormatado, semMarcas, textoSimples } from "../src/lib/texto-formatado.ts";
import { estiloDoBloco, htmlDoTexto, type NoRico, organizarColado, pareceTitulo, textoDoHtml } from "../src/lib/texto-rico-core.ts";

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
  it("o texto das tarefas (notas e comentários) vai e volta igual", () => {
    for (const md of [
      "Combinado com @Ana e @bruno.costa: conferir amanhã.",
      "Veja https://rioverde.go.gov.br/pca antes.",
      "1. abrir o protocolo\n2. conferir os DFDs\n3. **enviar**",
      "primeira linha\nsegunda linha do mesmo parágrafo",
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

describe("alinhamento e lista que começa num número", () => {
  it("vai e volta pelo editor", () => {
    const md = "[[centro]] ## Título\n\n[[justificado]] Um parágrafo\nem duas linhas\n\n[[direita]] > citação\n\n3. três\n4. quatro\n\nfim";
    assert.equal(ida(md), md);
    const b = lerTextoFormatado(md);
    assert.equal(b[0].t === "titulo" && b[0].al, "centro");
    assert.equal(b[1].t === "par" && b[1].al, "justificado");
    assert.equal(b[3].t === "lista" && b[3].inicio, 3);
    assert.match(textoSimples(md), /3\. três\n4\. quatro/);
  });
  it("lê o text-align e o align do colado (também de um div alinhado)", () => {
    assert.equal(textoDoHtml(parse('<p style="text-align: center;">a</p><div align="right"><p>b</p></div><p style="text-align:left">c</p>')), "[[centro]] a\n\n[[direita]] b\n\nc");
  });
  it("lista romana e de letras colada fica como escrita", () => {
    assert.equal(textoDoHtml(parse('<ol style="list-style-type:upper-roman"><li>um</li><li>dois</li></ol><ol type="a"><li>x</li></ol>')), "I. um\n\nII. dois\n\na) x");
  });
});

describe("organizar o texto colado", () => {
  const colado = [
    "1. Objeto e aceitação",
    "",
    "1.1. Este Termo estabelece as condições de utilização do Sistema.",
    "",
    "2. Definições",
    "",
    "I. Sistema: a plataforma.",
    "",
    "II. Usuário: o agente público.",
    "",
    "10. Alterações deste Termo",
    "",
    "10.1. Este Termo pode ser atualizado.",
  ].join("\n");
  it("os títulos de seção viram Título 2 e os itens ficam como escritos", () => {
    const t = organizarColado(colado, true);
    assert.equal(
      t,
      "## 1. Objeto e aceitação\n\n1.1. Este Termo estabelece as condições de utilização do Sistema.\n\n## 2. Definições\n\nI. Sistema: a plataforma.\n\nII. Usuário: o agente público.\n\n## 10. Alterações deste Termo\n\n10.1. Este Termo pode ser atualizado.",
    );
    const blocos = lerTextoFormatado(t);
    assert.equal(blocos.filter((b) => b.t === "titulo").length, 3);
    assert.equal(blocos.filter((b) => b.t === "lista").length, 0, "nada vira lista renumerada");
  });
  it("junta as linhas quebradas pela largura e separa nos itens", () => {
    assert.equal(organizarColado("O Sistema deve ser utilizado\nexclusivamente para o serviço.\nI. compartilhar a senha;\nII. inserir infor-\nmações falsas;", true), "O Sistema deve ser utilizado exclusivamente para o serviço.\n\nI. compartilhar a senha;\n\nII. inserir informações falsas;");
  });
  it("mensagem curta não vira título", () => {
    assert.equal(organizarColado("1. Sim", true), "1. Sim");
    assert.equal(pareceTitulo("1. Este termo vale."), false);
    assert.equal(pareceTitulo("DISPOSIÇÕES FINAIS"), true);
  });
});

describe("auditoria do editor e da colagem (v1.178.1)", () => {
  it("marca repetida vale pela última e semMarcas limpa o texto cru", () => {
    const b = lerTextoFormatado("[[centro]] [[direita]] Texto");
    assert.equal(b[0].t === "par" && b[0].al, "direita");
    assert.equal(semMarcas("[[centro]] A\n[[justificado]] B"), "A\nB");
  });
  it("lista: alinhamento só quando todos os itens concordam", () => {
    const mesmo = textoDoHtml(parse('<ul><li style="text-align:center">a</li><li style="text-align:center">b</li></ul>'));
    assert.equal(mesmo, "[[centro]] - a\n- b");
    const misto = textoDoHtml(parse('<ul><li style="text-align:center">a</li><li>b</li></ul>'));
    assert.equal(misto, "- a\n- b");
  });
  it("Google Docs: <b font-weight:normal> não vira negrito", () => {
    assert.equal(textoDoHtml(parse('<b id="docs-internal-guid-x" style="font-weight:normal"><p>Texto</p></b>')), "Texto");
  });
  it("título em negrito colado vira Título 2; no chat não", () => {
    const t = "**1. Objeto e aceitação**\n\nTexto um.\n\nTexto dois.";
    assert.match(organizarColado(t, false), /^## 1\. Objeto e aceitação/);
    assert.ok(!organizarColado(t, false, false).includes("##"));
  });
});

describe("colado com <br> no meio da frase", () => {
  it("junta a linha quebrada pela largura; mantém a quebra real", () => {
    assert.equal(organizarColado("O sistema registra\no acesso.\nNova linha.", false), "O sistema registra o acesso.\nNova linha.");
  });
});
