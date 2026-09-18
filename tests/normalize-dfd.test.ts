import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normPrevisao, normPrioridade, valoresBatem } from "../src/lib/normalize.ts";

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
  it("recorrente com ano → ANUAL/ano", () => {
    const r = normPrevisao("MENSALMENTE POR 12 MESES NO DECORRER DE 2027");
    assert.equal(r.valor, "ANUAL/2027");
    assert.equal(r.anual, true);
  });
  it("anual SEM ano é válido (bare ANUAL) — várias escritas", () => {
    assert.deepEqual(normPrevisao("ANUAL"), { valor: "ANUAL", anual: true, auto: false }); // já canônico
    assert.equal(normPrevisao("Anual").valor, "ANUAL"); // caixa diferente
    assert.equal(normPrevisao("anual").anual, true);
    assert.equal(normPrevisao("ANUALMENTE").valor, "ANUAL");
    assert.equal(normPrevisao("ANUALMENTE").auto, true); // reconheceu mas não era canônico
    assert.equal(normPrevisao("MENSALMENTE").valor, "ANUAL"); // recorrente sem ano
    assert.equal(normPrevisao("AO LONGO DO ANO").valor, "ANUAL");
    assert.equal(normPrevisao("DURANTE TODO O ANO").valor, "ANUAL");
  });
  it("todos os reais marcam auto=true (não eram canônicos)", () => {
    assert.equal(normPrevisao("FEVEREIRO DE 2027").auto, true);
    assert.equal(normPrevisao("FEVEREIRO/2027").auto, false); // já canônico
  });
  it("vazio / irreconhecível → null (tratar)", () => {
    assert.equal(normPrevisao("").valor, null);
    assert.equal(normPrevisao("em breve").valor, null);
    assert.equal(normPrevisao("data a definir").valor, null);
  });
  it("ponto 8 — mês por extenso SEM ano usa o ano do PCA (o usuário ainda edita)", () => {
    assert.equal(normPrevisao("FEVEREIRO", 2027).valor, "FEVEREIRO/2027");
    assert.equal(normPrevisao("A PARTIR DE ABRIL", 2027).valor, "ABRIL/2027");
    assert.equal(normPrevisao("ANUAL", 2027).valor, "ANUAL/2027"); // recorrente ganha o ano do PCA
    assert.equal(normPrevisao("FEVEREIRO").valor, null); // sem ano do texto e sem PCA → a definir
  });
  it("ponto 7 — o ano do TEXTO tem precedência sobre o do PCA (edição preservada)", () => {
    assert.equal(normPrevisao("MAIO/2028", 2027).valor, "MAIO/2028");
    assert.equal(normPrevisao("31/05/2027", 2027).valor, "MAIO/2027");
  });
});

describe("valoresBatem (capa × somatória dos DFDs)", () => {
  it("iguais (com tolerância de 1 centavo) batem", () => {
    assert.equal(valoresBatem(1000, 1000), true);
    assert.equal(valoresBatem(1000, 1000.009), true); // ruído de float < 1 centavo
    assert.equal(valoresBatem(0, 0), true);
  });
  it("diferentes não batem", () => {
    assert.equal(valoresBatem(0, 512342.72), false); // capa 0,00 × somatória real
    assert.equal(valoresBatem(1000, 1000.5), false);
  });
  it("null de qualquer lado nunca bate", () => {
    assert.equal(valoresBatem(null, 1000), false);
    assert.equal(valoresBatem(1000, null), false);
    assert.equal(valoresBatem(null, null), false);
    assert.equal(valoresBatem(undefined, 0), false);
  });
});
