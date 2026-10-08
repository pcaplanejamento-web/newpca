import assert from "node:assert/strict";
import { test } from "node:test";
import { ATRIBUTO_COBRIR, cssProtecao, svgMarcaDagua, diffProtecao, lerConfigProtecao, PROTECAO_PADRAO, protecaoDoPapel, protecaoPublica } from "../src/lib/protecao-core.ts";
import { configProtecaoSchema } from "../src/lib/protecao-validation.ts";

test("lerConfigProtecao: lixo = tudo desligado; ids inválidos/repetidos saem", () => {
  assert.deepEqual(lerConfigProtecao(null), PROTECAO_PADRAO);
  assert.deepEqual(lerConfigProtecao("x"), PROTECAO_PADRAO);
  const c = lerConfigProtecao({ selecao: true, print: "sim", papeis: [3, 3, -1, 2.5, "4", 7], publica: true });
  assert.deepEqual(c, { selecao: true, print: false, foco: false, marca: false, papeis: [3, 7], publica: true });
});

test("protecaoDoPapel: só nos papéis escolhidos e com algum bloqueio", () => {
  const c = lerConfigProtecao({ selecao: true, print: true, papeis: [2] });
  assert.deepEqual(protecaoDoPapel(c, 2), { selecao: true, print: true, foco: false, marca: false });
  assert.equal(protecaoDoPapel(c, 1), null);
  assert.equal(protecaoDoPapel(c, null), null);
  assert.equal(protecaoDoPapel(lerConfigProtecao({ papeis: [2] }), 2), null);
});

test("protecaoPublica: só com a tela pública ligada", () => {
  assert.equal(protecaoPublica(lerConfigProtecao({ selecao: true })), null);
  assert.deepEqual(protecaoPublica(lerConfigProtecao({ foco: true, publica: true })), { selecao: false, print: false, foco: true, marca: false });
  assert.equal(protecaoPublica(lerConfigProtecao({ publica: true })), null);
});

test("cssProtecao: campos seguem selecionáveis; impressão só quando ligada", () => {
  assert.deepEqual(protecaoDoPapel(lerConfigProtecao({ marca: true, papeis: [1] }), 1), { selecao: false, print: false, foco: false, marca: true });
  const s = cssProtecao({ selecao: true, print: false, foco: false, marca: false });
  assert.match(s, /user-select:none/);
  assert.match(s, /input, textarea, select/);
  assert.doesNotMatch(s, /@media print/);
  assert.doesNotMatch(s, new RegExp(ATRIBUTO_COBRIR));
  const p = cssProtecao({ selecao: false, print: true, foco: false, marca: false });
  assert.match(p, /@media print/);
  assert.match(p, new RegExp(`html\\[${ATRIBUTO_COBRIR}\\]::after`));
  assert.doesNotMatch(p, /user-select/);
  const f = cssProtecao({ selecao: false, print: false, foco: true, marca: false });
  assert.match(f, new RegExp(ATRIBUTO_COBRIR));
  assert.doesNotMatch(f, /@media print/);
  assert.equal(cssProtecao({ selecao: false, print: false, foco: false, marca: true }), "");
});

test("svgMarcaDagua: texto escapado dentro de um data-URL", () => {
  const u = svgMarcaDagua('Ana <b>"x"</b> & Cia');
  assert.match(u, /^url\("data:image\/svg\+xml;charset=utf-8,/);
  const svg = decodeURIComponent(u.slice(u.indexOf(",") + 1, -2));
  assert.match(svg, /Ana &lt;b&gt;&quot;x&quot;&lt;\/b&gt; &amp; Cia/);
  assert.doesNotMatch(svg, /<b>/);
});

test("diffProtecao + schema", () => {
  const nomes = new Map([[2, "Gestor"]]);
  assert.equal(diffProtecao(PROTECAO_PADRAO, lerConfigProtecao({ selecao: true, papeis: [2] }), nomes), "bloquear seleção e cópia ligado; papéis: Gestor");
  assert.equal(diffProtecao(PROTECAO_PADRAO, PROTECAO_PADRAO, nomes), "sem mudança");
  assert.equal(configProtecaoSchema.safeParse({ selecao: true, print: false, foco: false, papeis: [1], publica: false }).success, true);
  assert.equal(configProtecaoSchema.parse({ selecao: true, print: false, foco: false, papeis: [1], publica: false }).marca, false);
  assert.equal(configProtecaoSchema.safeParse({ selecao: true, print: false, foco: false, papeis: [0], publica: false }).success, false);
  assert.equal(configProtecaoSchema.safeParse({ selecao: true, print: false, foco: false, papeis: [], publica: false, x: 1 }).success, false);
});
