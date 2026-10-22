import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAVES_PESSOAIS, lerContas, MAX_CONTAS, textoContas } from "../src/lib/contas-core.ts";

const t = (c: string) => c.repeat(64);

test("lerContas: só tokens válidos, sem repetir, até o teto", () => {
  assert.deepEqual(lerContas(undefined), []);
  assert.deepEqual(lerContas(`${t("a")}.lixo.${t("a")}.${t("b")}`), [t("a"), t("b")]);
  const muitos = ["1", "2", "3", "4", "5", "6"].map(t).join(".");
  assert.equal(lerContas(muitos).length, MAX_CONTAS);
  assert.deepEqual(lerContas("<script>.;x=1"), []);
});

test("textoContas: vazio apaga; normaliza", () => {
  assert.equal(textoContas([]), "");
  assert.equal(textoContas([t("c"), "x", t("c")]), t("c"));
});

test("chaves pessoais não incluem preferências do aparelho", () => {
  assert.ok(CHAVES_PESSOAIS.includes("pesquisa:recentes"));
  assert.ok(!CHAVES_PESSOAIS.some((k) => k.startsWith("menu:") || (k as string) === "theme"));
});
