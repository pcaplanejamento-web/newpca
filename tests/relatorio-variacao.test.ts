import assert from "node:assert/strict";
import { test } from "node:test";
import { consolidarItens } from "../src/lib/itens-consolidados.ts";
import { blocosRelatorioVariacao, mediana, porSigla, recortarVariacao, relatorioVariacao, type ItemVariacao } from "../src/lib/relatorio-variacao.ts";

let id = 0;
function it(codigo: string | null, vu: number | null, qtd: number | null, extra: Partial<ItemVariacao> = {}): ItemVariacao {
  id++;
  return {
    id,
    codigo,
    descricao: "CANETA AZUL",
    unidade: "UN",
    quantidade: qtd,
    valorUnitario: vu,
    valorTotal: vu != null && qtd != null ? vu * qtd : null,
    dfdNumero: String(100 + id),
    dfdPlanejamento: String(500 + id),
    protocoloNumero: "1/2026",
    sigla: "SME",
    item: 1,
    ...extra,
  };
}

test("mediana", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([3, 1, 2]), 2);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
});

test("aponta o item inflado e o impacto bate com a soma", () => {
  const linhas = consolidarItens([it("1", 10, 10), it("1", 10, 10), it("1", 20, 5)]);
  const r = relatorioVariacao(linhas);
  // média ponderada = (100+100+100)/25 = 12; 20 é +66,7% → alerta
  assert.equal(r.inflados.length, 1);
  const i = r.inflados[0];
  assert.equal(i.nivel, "alerta");
  assert.ok(Math.abs(i.referencia - 12) < 1e-9);
  assert.ok(Math.abs(i.impacto - (20 - 12) * 5) < 1e-9);
  assert.ok(Math.abs(r.resumo.impacto - i.impacto) < 1e-9);
  assert.equal(r.codigos[0].inflados, 1);
});

test("o histórico menor que a média vira a referência", () => {
  const linhas = consolidarItens([it("2", 10, 1), it("2", 10, 1)]);
  const r = relatorioVariacao(linhas, { "2": { atual: 7, data: null, medio: 7, menor: 7, maior: 7, contratos: 1 } });
  assert.equal(r.inflados.length, 2);
  assert.equal(r.inflados[0].base, "historico");
  assert.equal(r.inflados[0].referencia, 7);
});

test("unidades mistas comparam dentro da mesma unidade", () => {
  const linhas = consolidarItens([it("3", 1, 10, { unidade: "UN" }), it("3", 1, 10, { unidade: "UN" }), it("3", 50, 2, { unidade: "CX" }), it("3", 50, 2, { unidade: "CX" })]);
  const r = relatorioVariacao(linhas);
  assert.equal(r.inflados.length, 0);
  assert.equal(r.codigos[0].unidadesMistas, true);
  assert.equal(r.codigos[0].porUnidade.length, 2);
  assert.equal(r.codigos[0].porUnidade[0].mediana != null, true);
});

test("sem comparação e itens fora da média não geram NaN", () => {
  const linhas = consolidarItens([it("4", 5, 1), it("5", null, null), it("5", 3, null)]);
  const r = relatorioVariacao(linhas);
  assert.equal(r.inflados.length, 0);
  assert.equal(r.resumo.semComparacao, 2);
  for (const c of r.codigos) assert.ok(!Number.isNaN(c.impacto));
  const blocos = blocosRelatorioVariacao(r);
  assert.ok(JSON.stringify(blocos).includes("Um preço só"));
  assert.ok(!JSON.stringify(blocos).includes("NaN"));
});

test("recorte e blocos com TOTAL em destaque", () => {
  const linhas = consolidarItens([it("6", 10, 10), it("6", 30, 10), it("7", 1, 1), it("7", 1, 1)]);
  const r = recortarVariacao(linhas, [linhas.find((l) => l.codigo === "6")!.chave]);
  assert.equal(r.resumo.codigos, 1);
  const blocos = blocosRelatorioVariacao(r);
  const tabela = blocos.find((b) => b.tipo === "tabela");
  assert.ok(tabela && tabela.tipo === "tabela" && tabela.linhas.at(-1)?.destaque);
  const so = blocosRelatorioVariacao(r, { soInflados: true });
  assert.equal(so.filter((b) => b.tipo === "tabela").length, 1);
});

test("um relatório por sigla", () => {
  const linhas = consolidarItens([it("8", 10, 1, { sigla: "SME" }), it("8", 30, 1, { sigla: "SMS" })]);
  const g = porSigla(linhas, consolidarItens);
  assert.deepEqual(
    g.map((x) => x.sigla),
    ["SME", "SMS"],
  );
});

test("escala: 20 mil itens", () => {
  const itens: ItemVariacao[] = [];
  for (let k = 0; k < 20000; k++) itens.push(it(String(k % 800), 1 + (k % 7), 1 + (k % 3)));
  const t = performance.now();
  const r = relatorioVariacao(consolidarItens(itens));
  assert.equal(r.resumo.codigos, 800);
  assert.ok(performance.now() - t < 2000);
});
