import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normPrevisao, normPrioridade } from "../src/lib/normalize.ts";

// Casos REAIS extraídos dos 3 protocolos (19 DFDs).

describe("normPrioridade (ALTA/MÉDIA/BAIXA)", () => {
  it("aceita os canônicos sem alterar", () => {
    assert.deepEqual(normPrioridade("ALTA"), { valor: "ALTA", auto: false });
    assert.deepEqual(normPrioridade("MÉDIA"), { valor: "MÉDIA", auto: false });
    assert.deepEqual(normPrioridade("BAIXA"), { valor: "BAIXA", auto: false });
  });
  it("auto-corrige variações reais", () => {
    assert.deepEqual(normPrioridade("MEDIA"), { valor: "MÉDIA", auto: true }); // acento
    assert.deepEqual(normPrioridade("PRIORIDADE ALTA"), { valor: "ALTA", auto: true }); // prefixo
    assert.deepEqual(normPrioridade("PRIORIDADE MÉDIA"), { valor: "MÉDIA", auto: true });
    assert.equal(normPrioridade("urgente").valor, "ALTA");
  });
  it("vazio/irreconhecível → null (tratar)", () => {
    assert.deepEqual(normPrioridade(""), { valor: null, auto: false });
    assert.deepEqual(normPrioridade("qualquer coisa"), { valor: null, auto: false });
    assert.deepEqual(normPrioridade(null), { valor: null, auto: false });
  });
});

describe("normPrevisao (MÊS/AAAA ou ANUAL/AAAA)", () => {
  it("datas numéricas → mês por extenso", () => {
    assert.equal(normPrevisao("01/01/2027").valor, "JANEIRO/2027");
    assert.equal(normPrevisao("01/2026").valor, "JANEIRO/2026");
    assert.equal(normPrevisao("09/2027").valor, "SETEMBRO/2027");
    assert.equal(normPrevisao("04/2027").valor, "ABRIL/2027");
  });
  it("mês por extenso (com ruído) → canônico", () => {
    assert.equal(normPrevisao("FEVEREIRO DE 2027").valor, "FEVEREIRO/2027");
    assert.equal(normPrevisao("ABRIL DE 2027").valor, "ABRIL/2027");
    assert.equal(normPrevisao("A PARTIR DE MAIO DE 2027.").valor, "MAIO/2027");
    assert.equal(normPrevisao("JANEIRO DE 2027").valor, "JANEIRO/2027");
  });
  it("recorrente → ANUAL/ano", () => {
    const r = normPrevisao("MENSALMENTE POR 12 MESES NO DECORRER DE 2027");
    assert.equal(r.valor, "ANUAL/2027");
    assert.equal(r.anual, true);
  });
  it("todos os reais marcam auto=true (não eram canônicos)", () => {
    assert.equal(normPrevisao("FEVEREIRO DE 2027").auto, true);
    assert.equal(normPrevisao("FEVEREIRO/2027").auto, false); // já canônico
  });
  it("sem ano / vazio → null (tratar)", () => {
    assert.equal(normPrevisao("").valor, null);
    assert.equal(normPrevisao("em breve").valor, null);
    assert.equal(normPrevisao("MENSALMENTE").valor, null); // recorrente sem ano
  });
});
