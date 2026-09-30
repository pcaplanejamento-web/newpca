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
  mesclarLayoutOculto,
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

  it("sem as colunas que o papel não vê: saem de larguras, congeladas, ocultas, ordem, filtros e ordenação", () => {
    const bruto = {
      larguras: { responsavel: 200, valor: 120 },
      fixadas: ["responsavel", "numero"],
      ocultas: ["distribuicao", "idExterno"],
      ordemManual: ["valor", "responsavel"],
      ordem: { key: "responsavel", dir: "desc" },
      filtros: { responsavel: ["Ana"], assunto: ["INCLUSÃO"] },
    };
    const sem = new Set(["responsavel", "distribuicao"]);
    const l = coerceLayoutTabela(bruto, sem);
    assert.deepEqual(l.larguras, { valor: 120 });
    assert.deepEqual(l.fixadas, ["numero"]);
    assert.deepEqual(l.ocultas, ["idExterno"]);
    assert.deepEqual(l.ordemManual, ["valor"]);
    assert.equal(l.ordem, null, "não ordena por coluna que não vê");
    assert.deepEqual(l.filtros, { assunto: ["INCLUSÃO"] });
    // Sem restrição, o mesmo de sempre.
    assert.deepEqual(coerceLayoutTabela(bruto, new Set()), coerceLayoutTabela(bruto));
  });

  it("gravar por cima com colunas ocultas: o ajuste delas fica como estava no gravado", () => {
    const gravado = {
      larguras: { responsavel: 200, valor: 120 },
      fixadas: ["numero", "responsavel"],
      ocultas: ["distribuicao"],
      ordemManual: ["responsavel", "valor", "assunto"],
      ordem: { key: "responsavel", dir: "asc" },
      filtros: { responsavel: ["Ana"], assunto: ["INCLUSÃO"] },
    };
    const sem = new Set(["responsavel", "distribuicao"]);
    // A pessoa (sem ver Responsável/Distribuição) mexeu no valor e no assunto, e tentou (em vão) mexer no responsável.
    const novo = {
      larguras: { valor: 150, responsavel: 60 },
      fixadas: ["numero"],
      ocultas: [],
      ordemManual: ["assunto", "valor"],
      ordem: null,
      filtros: { assunto: ["EXCLUSÃO"], responsavel: ["Beto"] },
    };
    const m = mesclarLayoutOculto(gravado, novo, sem);
    assert.deepEqual(m.larguras, { responsavel: 200, valor: 150 });
    assert.deepEqual(m.fixadas, ["numero", "responsavel"]);
    assert.deepEqual(m.ocultas, ["distribuicao"]);
    assert.deepEqual(m.ordemManual, ["responsavel", "assunto", "valor"]);
    assert.deepEqual(m.ordem, { key: "responsavel", dir: "asc" }, "a ordenação por coluna oculta segue enquanto a pessoa não escolhe outra");
    assert.deepEqual(m.filtros, { assunto: ["EXCLUSÃO"], responsavel: ["Ana"] });
    // Escolhendo uma ordenação visível, vale a da pessoa.
    assert.deepEqual(mesclarLayoutOculto(gravado, { ...novo, ordem: { key: "valor", dir: "desc" } }, sem).ordem, { key: "valor", dir: "desc" });
    // Sem restrição, vale o novo.
    assert.deepEqual(mesclarLayoutOculto(gravado, novo, new Set()), coerceLayoutTabela(novo));
  });
});
