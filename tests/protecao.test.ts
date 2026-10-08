import assert from "node:assert/strict";
import { test } from "node:test";
import { cssProtecao, diffProtecao, lerConfigProtecao, PROTECAO_PADRAO, protecaoDoPapel, protecaoPublica } from "../src/lib/protecao-core.ts";
import { configProtecaoSchema } from "../src/lib/protecao-validation.ts";

test("lerConfigProtecao: lixo = tudo desligado; ids inválidos/repetidos saem", () => {
  assert.deepEqual(lerConfigProtecao(null), PROTECAO_PADRAO);
  assert.deepEqual(lerConfigProtecao("x"), PROTECAO_PADRAO);
  const c = lerConfigProtecao({ selecao: true, print: "sim", papeis: [3, 3, -1, 2.5, "4", 7], publica: true });
  assert.deepEqual(c, { selecao: true, print: false, foco: false, papeis: [3, 7], publica: true });
});

test("protecaoDoPapel: só nos papéis escolhidos e com algum bloqueio", () => {
  const c = lerConfigProtecao({ selecao: true, print: true, papeis: [2] });
  assert.deepEqual(protecaoDoPapel(c, 2), { selecao: true, print: true, foco: false });
  assert.equal(protecaoDoPapel(c, 1), null);
  assert.equal(protecaoDoPapel(c, null), null);
  assert.equal(protecaoDoPapel(lerConfigProtecao({ papeis: [2] }), 2), null);
});

test("protecaoPublica: só com a tela pública ligada", () => {
  assert.equal(protecaoPublica(lerConfigProtecao({ selecao: true })), null);
  assert.deepEqual(protecaoPublica(lerConfigProtecao({ foco: true, publica: true })), { selecao: false, print: false, foco: true });
  assert.equal(protecaoPublica(lerConfigProtecao({ publica: true })), null);
});

test("cssProtecao: campos seguem selecionáveis; impressão só quando ligada", () => {
  const s = cssProtecao({ selecao: true, print: false, foco: false });
  assert.match(s, /user-select:none/);
  assert.match(s, /input, textarea, select/);
  assert.doesNotMatch(s, /@media print/);
  const p = cssProtecao({ selecao: false, print: true, foco: false });
  assert.match(p, /@media print/);
  assert.doesNotMatch(p, /user-select/);
  assert.equal(cssProtecao({ selecao: false, print: false, foco: true }), "");
});

test("diffProtecao + schema", () => {
  const nomes = new Map([[2, "Gestor"]]);
  assert.equal(diffProtecao(PROTECAO_PADRAO, lerConfigProtecao({ selecao: true, papeis: [2] }), nomes), "bloquear seleção e cópia ligado; papéis: Gestor");
  assert.equal(diffProtecao(PROTECAO_PADRAO, PROTECAO_PADRAO, nomes), "sem mudança");
  assert.equal(configProtecaoSchema.safeParse({ selecao: true, print: false, foco: false, papeis: [1], publica: false }).success, true);
  assert.equal(configProtecaoSchema.safeParse({ selecao: true, print: false, foco: false, papeis: [0], publica: false }).success, false);
  assert.equal(configProtecaoSchema.safeParse({ selecao: true, print: false, foco: false, papeis: [], publica: false, x: 1 }).success, false);
});
