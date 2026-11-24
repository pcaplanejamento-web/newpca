import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CampoDado,
  camposDesconhecidos,
  camposDoTexto,
  camposEmOrdem,
  chaveDoChip,
  htmlComCampos,
  mapaCampos,
  type NoLinha,
  RE_CAMPO_DIGITADO,
  RE_GATILHO_CAMPO,
  substituirCampos,
  textoDaLinha,
} from "../src/lib/campos-dados-core.ts";
import {
  CAMPOS_DOCUMENTO,
  camposComExemplo,
  celulaItem,
  configPadrao,
  lerConfigDocumento,
  tituloColuna,
  totaisDocumento,
  valoresMarcadores,
} from "../src/lib/pca-documento-core.ts";
import type { ItemRow } from "../src/lib/queries.ts";
import { htmlDoTexto, type NoRico, textoDoHtml } from "../src/lib/texto-rico-core.ts";

const CAMPOS: CampoDado[] = [
  { chave: "ano", rotulo: "Ano do PCA", grupo: "PCA", exemplo: "2027" },
  { chave: "valor", rotulo: "Valor <total>", grupo: "Totais" },
  { chave: "nome", rotulo: "Nome", grupo: "PCA", descricao: "o nome do plano" },
];
const MAPA = mapaCampos(CAMPOS);

// Um "DOM" mínimo: tags, atributos com hífen e as entidades que o editor produz.
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
const des = (s: string) =>
  s
    .replace(/&#8203;/g, "​")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
function parse(html: string): No {
  const raiz = el("div", {}, []);
  const pilha: No[] = [raiz];
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    const topo = pilha[pilha.length - 1];
    if (m[4] != null) topo.childNodes.push(tx(des(m[4])));
    else if (m[1]) pilha.pop();
    else {
      const attrs: Record<string, string> = {};
      for (const a of m[3].matchAll(/([a-z-]+)="([^"]*)"/g)) attrs[a[1]] = des(a[2]);
      const n = el(m[2], attrs, []);
      topo.childNodes.push(n);
      if (m[2].toLowerCase() !== "br") pilha.push(n);
    }
  }
  return raiz;
}

test("htmlComCampos: só os conhecidos viram chip; o resto é escapado; o rótulo do chip também", () => {
  const h = htmlComCampos("PCA {{ano}} — {{xpto}} <b>&", MAPA);
  assert.match(h, /data-campo="ano"/);
  assert.match(h, /contenteditable="false"/);
  assert.match(h, /\{\{xpto\}\}/);
  assert.match(h, /&lt;b&gt;&amp;/);
  assert.doesNotMatch(htmlComCampos("{{valor}}", MAPA), /<total>/);
  assert.equal(htmlComCampos("sem campos", MAPA), "sem campos");
});

test("textoDaLinha: chip → {{chave}}; espaço de largura zero sai; quebras viram espaço", () => {
  const raiz = parse(`Plano ${htmlComCampos("{{ano}}", MAPA)}​<br>de {{nome}}`);
  assert.equal(textoDaLinha(raiz as NoLinha), "Plano {{ano}} de {{nome}}");
});

test("chaveDoChip recusa chave inválida (nada de atributo forjado)", () => {
  assert.equal(chaveDoChip((n) => (n === "data-campo" ? "ano" : null)), "ano");
  assert.equal(chaveDoChip((n) => (n === "data-campo" ? "a b<" : null)), null);
  assert.equal(chaveDoChip(undefined), null);
});

test("texto rico: chips vão e voltam iguais (htmlDoTexto ↔ textoDoHtml)", () => {
  const md = "**Plano {{ano}}** de {{nome}}\n\n- valor: {{valor}}";
  const html = htmlDoTexto(md, CAMPOS);
  assert.match(html, /data-campo="ano"/);
  assert.equal(textoDoHtml(parse(html)), md);
  // Sem a lista de campos, o texto fica literal (como era).
  assert.equal(textoDoHtml(parse(htmlDoTexto(md))), md);
});

test("substituir: uma passada, o desconhecido fica, nada do protótipo", () => {
  assert.equal(substituirCampos("{{a}} {{b}} {{toString}}", { a: "{{b}}", b: "2" }), "{{b}} 2 {{toString}}");
  assert.deepEqual(camposDoTexto("{{a}}{{b}}{{a}}"), ["a", "b"]);
  assert.deepEqual(camposDesconhecidos("{{ano}} {{zz}}", MAPA), ["zz"]);
  assert.deepEqual(camposDesconhecidos("{{ano}} {{constructor}}", { ano: 1 }), ["constructor"]);
});

test("ordem da lista = agrupada e filtrada sem acento", () => {
  assert.deepEqual(
    camposEmOrdem(CAMPOS, "").map((c) => c.chave),
    ["ano", "nome", "valor"],
  );
  assert.deepEqual(
    camposEmOrdem(CAMPOS, "PLANO").map((c) => c.chave),
    ["nome"],
  );
});

test("gatilhos digitados: {{ abre a lista; {{chave}} completo vira chip", () => {
  assert.equal("texto {{an".match(RE_GATILHO_CAMPO)?.[1], "an");
  assert.equal("x {{ ano }}".match(RE_CAMPO_DIGITADO)?.[1], "ano");
  assert.equal("x {{1a}}".match(RE_CAMPO_DIGITADO), null);
});

test("documento: colunas antigas, títulos próprios e os dados dos marcadores", () => {
  const c = lerConfigDocumento({ ...configPadrao(), colunas: ["dfd", "descricao", "planejamento"], titulosColunas: { descricao: "Objeto", codigo: "", xx: "?" } });
  assert.deepEqual(c.colunas, ["sequencial", "dfdNumero", "planejamento", "descricao"]);
  assert.deepEqual(c.titulosColunas, { descricao: "Objeto" });
  assert.equal(tituloColuna(c, "descricao"), "Objeto");
  assert.equal(tituloColuna(c, "codigo"), "Código");

  const d = { pca: { id: 1, nome: "PCA 2027", ano: 2027 }, itens: [] as ItemRow[], dfds: [], unidades: {} };
  const v = valoresMarcadores(d, totaisDocumento(d), { ente: "Rio Verde {{ano}}", local: "{{ente}}" }, "2026-11-24T12:00:00Z");
  assert.equal(v.ente, "Rio Verde 2027");
  // Sem laço: o local não troca o "{{ente}}" (a chave não está entre os valores de base).
  assert.equal(v.local, "{{ente}}");
  const campos = camposComExemplo(d, { ente: "", local: "" }, "2026-11-24T12:00:00Z");
  assert.equal(campos.length, CAMPOS_DOCUMENTO.length);
  assert.equal(campos.find((x) => x.chave === "ano")?.exemplo, "2027");
});

test("documento: a célula do item traz DFD, planejamento, tipo e o nome da unidade", () => {
  const item = { sequencial: 7, idProduto: "123", nomeProduto: "X", dfdNumero: "101", codigo: "SME", valorTotal: 1 } as unknown as ItemRow;
  const dfds = new Map([["101", { planejamento: "2001", tipo: "DFD-S" }]]);
  assert.equal(celulaItem(item, "dfdNumero", dfds, {}), "101");
  assert.equal(celulaItem(item, "planejamento", dfds, {}), "2001");
  assert.equal(celulaItem(item, "sequencial", dfds, {}), "7");
  assert.equal(celulaItem({ ...item, dfdNumero: null } as unknown as ItemRow, "planejamento", dfds, {}), "—");
});
