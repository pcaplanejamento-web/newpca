import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  basePercentual,
  colunaPermitida,
  cruzar,
  lancamentosDoRecorte,
  MAX_COLUNAS_CRUZAMENTO,
  matrizCruzamento,
  medidaOrcamento,
  ordenarLinhas,
  percentual,
  permissoesColunas,
  permissoesLinhas,
  semVazios,
} from "../src/lib/orcamento-cruzamento.ts";

const V = { valorEmendaImpositiva: 0, valorSuplementacao: 0, valorEmpenho: 0, saldo: 0, valorAnulacao: 0 };
const L = [
  { ...V, unidade: "10 - SEMUS", nomeElemento: "DIÁRIAS", codigoElemento: "339014", valorInicial: 100 },
  { ...V, unidade: "10 - SEMUS", nomeElemento: "AUXÍLIOS", codigoElemento: "339048", valorInicial: 50, valorSuplementacao: 20, valorAnulacao: 5 },
  { ...V, unidade: "2 - SEMED", nomeElemento: "Diárias", codigoElemento: "339014", valorInicial: 30 },
  { ...V, unidade: "2 - SEMED", nomeElemento: "OBRAS", codigoElemento: "449051", valorInicial: 0 },
  { ...V, unidade: null, nomeElemento: "DIÁRIAS", codigoElemento: "339014", valorInicial: 7 },
];

describe("orcamento-cruzamento", () => {
  it("cruza linhas × colunas (ordem natural, chave sem caixa/acento, vazio = —) e fecha os totais", () => {
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    assert.deepEqual(
      c.linhas.map((l) => l.rotulo),
      ["—", "2 - SEMED", "10 - SEMUS"],
    );
    assert.deepEqual(
      c.colunas.map((x) => x.rotulo),
      ["AUXÍLIOS", "DIÁRIAS", "OBRAS"],
    );
    const semus = c.linhas.find((l) => l.rotulo === "10 - SEMUS");
    assert.deepEqual(semus?.valores, [50, 100, 0]);
    assert.equal(c.linhas.find((l) => l.rotulo === "2 - SEMED")?.valores[1], 30, "Diárias = DIÁRIAS");
    assert.equal(c.total, 187);
    assert.equal(
      c.colunas.reduce((s, x) => s + x.total, 0),
      c.total,
    );
    assert.equal(
      c.linhas.reduce((s, x) => s + x.total, 0),
      c.total,
    );
  });

  it("medida atualizada = inicial + suplementação − anulação", () => {
    assert.equal(medidaOrcamento("atualizada").valor(L[1]), 65);
    assert.equal(cruzar(L, "unidade", "nomeElemento", "atualizada").total, 202);
  });

  it("colunas PERMITIDAS: não a mesma, com dados, até o teto e não 1 para 1", () => {
    const p = permissoesColunas(L, "nomeElemento");
    assert.equal(p.nomeElemento.permitida, false);
    assert.match(p.codigoElemento.motivo ?? "", /1 para 1/);
    assert.equal(p.unidade.permitida, true);
    assert.equal(p.funcao.permitida, false, "sem dados neste orçamento");
    assert.equal(permissoesLinhas(L).funcao.permitida, false);
    const muitos = Array.from({ length: MAX_COLUNAS_CRUZAMENTO + 1 }, (_, i) => ({ ...V, valorInicial: 1, ficha: String(i), unidade: i % 2 ? "A" : "B" }));
    assert.equal(permissoesColunas(muitos, "unidade").ficha.permitida, false);
    assert.equal(colunaPermitida(p, "codigoElemento"), "unidade");
    assert.equal(colunaPermitida(p, "unidade"), "unidade");
  });

  it("origem de cada número: a soma do recorte = a célula / linha / coluna / total", () => {
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    const soma = (ls: typeof L) => ls.reduce((s, l) => s + l.valorInicial, 0);
    for (const linha of c.linhas) {
      assert.equal(soma(lancamentosDoRecorte(L, "unidade", "nomeElemento", linha.chave, null)), linha.total);
      c.colunas.forEach((col, j) => {
        assert.equal(soma(lancamentosDoRecorte(L, "unidade", "nomeElemento", linha.chave, col.chave)), linha.valores[j]);
      });
    }
    assert.equal(soma(lancamentosDoRecorte(L, "unidade", "nomeElemento", null, null)), c.total);
  });

  it("sem vazios tira linhas/colunas todas zeradas; ordenação por total e por coluna", () => {
    const c = semVazios(cruzar(L, "unidade", "nomeElemento", "inicial"));
    assert.deepEqual(
      c.colunas.map((x) => x.rotulo),
      ["AUXÍLIOS", "DIÁRIAS"],
    );
    assert.ok(c.linhas.every((l) => l.valores.length === 2));
    assert.deepEqual(
      ordenarLinhas(c, { por: "total", desc: true }).map((l) => l.rotulo),
      ["10 - SEMUS", "2 - SEMED", "—"],
    );
    const diarias = c.colunas[1].chave;
    assert.deepEqual(
      ordenarLinhas(c, { por: { coluna: diarias }, desc: false }).map((l) => l.rotulo),
      ["—", "2 - SEMED", "10 - SEMUS"],
    );
  });

  it("percentuais e matriz de exportação", () => {
    assert.equal(basePercentual("valor", { linha: 1, coluna: 2, geral: 3 }), null);
    assert.equal(basePercentual("coluna", { linha: 1, coluna: 2, geral: 3 }), 2);
    assert.equal(percentual(25, 100), 25);
    assert.equal(percentual(5, 0), null);
    const c = cruzar(L, "unidade", "nomeElemento", "inicial");
    const m = matrizCruzamento(c, c.linhas, "Unidade", { rotulo: "Sigla", de: (k) => (k.includes("SEMUS") ? "SMS" : "") });
    assert.deepEqual(m[0], ["Unidade", "Sigla", "Total", "AUXÍLIOS", "DIÁRIAS", "OBRAS"]);
    assert.deepEqual(m.at(-1), ["TOTAL", "", 187, 50, 137, 0]);
  });
});
