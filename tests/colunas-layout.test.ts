import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alternarOculta,
  coerceLayoutTabela,
  comLargura,
  comOrdem,
  LARGURA_MAX,
  LARGURA_MIN,
  LAYOUT_TABELA_PADRAO,
  layoutTabelaIgual,
} from "../src/lib/colunas-layout.ts";

describe("colunas-layout (DataTable)", () => {
  it("qualquer JSON vira um layout válido (padrão vazio)", () => {
    assert.deepEqual(coerceLayoutTabela(null), LAYOUT_TABELA_PADRAO);
    assert.deepEqual(coerceLayoutTabela("x"), LAYOUT_TABELA_PADRAO);
    assert.deepEqual(coerceLayoutTabela([1, 2]), LAYOUT_TABELA_PADRAO);
  });

  it("guarda colunas, ordenação e FILTROS válidos (valores, faixa e datas); descarta o resto", () => {
    const l = coerceLayoutTabela({
      larguras: { b: 9999, a: 10, c: "x" },
      fixadas: ["a", "a", 3, "b"],
      ocultas: ["c"],
      ordemManual: ["d", "c"],
      ordem: { key: "valor", dir: "desc" },
      filtros: {
        estado: ["Regular", 5, "Sem prioridade"],
        valor: { min: 10, max: "x" },
        data: { de: "2026-01-01" },
        vazio: [],
        lixo: { foo: 1 },
      },
    });
    assert.deepEqual(l.larguras, { a: LARGURA_MIN, b: LARGURA_MAX });
    assert.deepEqual(Object.keys(l.larguras), ["a", "b"]);
    assert.deepEqual(l.fixadas, ["a", "b"]);
    assert.deepEqual(l.ocultas, ["c"]);
    assert.deepEqual(l.ordemManual, ["d", "c"]);
    assert.deepEqual(l.ordem, { key: "valor", dir: "desc" });
    assert.deepEqual(l.filtros, { data: { de: "2026-01-01", ate: undefined }, estado: ["Regular", "Sem prioridade"], valor: { min: 10, max: undefined } });
    assert.equal(coerceLayoutTabela({ ordem: { key: "x", dir: "?" } }).ordem?.dir, "asc");
    assert.equal(coerceLayoutTabela({ ordem: { dir: "desc" } }).ordem, null);
  });

  it("ações de edição: largura (null = padrão), ocultar alterna, ordem preserva as colunas de fora", () => {
    const base = { ...LAYOUT_TABELA_PADRAO, fixadas: ["z"], ordemManual: ["y"] };
    assert.equal(comLargura(base, "a", 120).larguras.a, 120);
    assert.equal(comLargura(comLargura(base, "a", 120), "a", null).larguras.a, undefined);
    assert.deepEqual(alternarOculta(alternarOculta(base, "a"), "a").ocultas, []);
    const o = comOrdem(base, ["a", "b", "c"], ["b"], ["c", "a"]);
    assert.deepEqual(o.fixadas, ["b", "z"]);
    assert.deepEqual(o.ordemManual, ["c", "a", "y"]);
  });

  it("igualdade pelo conteúdo (ordem das chaves das larguras/filtros não importa)", () => {
    const a = coerceLayoutTabela({ larguras: { a: 100, b: 200 }, filtros: { x: ["1"], y: ["2"] } });
    const b = coerceLayoutTabela({ larguras: { b: 200, a: 100 }, filtros: { y: ["2"], x: ["1"] } });
    assert.ok(layoutTabelaIgual(a, b));
    assert.ok(!layoutTabelaIgual(a, coerceLayoutTabela({ larguras: { a: 100 } })));
  });
});
