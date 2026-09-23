import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colunaDe, linhaDe, montarGrade, type OpsGrade, type PdfTraco, tracosDaOpList } from "../src/lib/grade-pdf.ts";
import { dfdCenti } from "./fixtures/dfd-centi.ts";

// OPS sintético (os números reais do pdf.js são injetados em produção).
const OPS: OpsGrade & { stroke: number; fill: number } = {
  save: 1,
  restore: 2,
  transform: 3,
  paintFormXObjectBegin: 4,
  paintFormXObjectEnd: 5,
  constructPath: 6,
  endPath: 7,
  stroke: 8,
  fill: 9,
};
const caminho = (...cmds: number[]) => [new Float32Array(cmds)];
const arred = (ts: PdfTraco[]) => ts.map((t) => ({ ...t, c: Math.round(t.c * 10) / 10, a: Math.round(t.a * 10) / 10, b: Math.round(t.b * 10) / 10 }));

describe("tracosDaOpList (traços retos do operator list, com a CTM)", () => {
  it("retângulo sob transform + Form XObject; recorte (endPath) e curva ficam de fora", () => {
    const fn = [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath, OPS.constructPath, OPS.paintFormXObjectBegin, OPS.constructPath, OPS.paintFormXObjectEnd];
    const args = [
      null,
      [2, 0, 0, 2, 10, 20],
      [OPS.stroke, caminho(0, 0, 0, 1, 5, 0, 1, 5, 3, 1, 0, 3, 4), null], // retângulo 5×3 → escala 2 + desloca
      null,
      [OPS.endPath, caminho(0, 0, 0, 1, 50, 0), null], // só recorte
      [OPS.fill, caminho(0, 0, 0, 2, 1, 1, 2, 2, 3, 3), null], // curva
      [[1, 0, 0, 1, 100, 0], [0, 0, 10, 10]],
      [OPS.stroke, caminho(0, 0, 5, 1, 10, 5), null], // linha horizontal dentro do Form
      null,
    ];
    assert.deepEqual(arred(tracosDaOpList(fn, args, OPS, 3)), [
      { page: 3, o: "h", c: 20, a: 10, b: 20 },
      { page: 3, o: "v", c: 20, a: 20, b: 26 },
      { page: 3, o: "h", c: 26, a: 10, b: 20 },
      { page: 3, o: "v", c: 10, a: 20, b: 26 },
      { page: 3, o: "h", c: 5, a: 100, b: 110 },
    ]);
  });

  it("caminho vazio/sem dados e comando desconhecido não quebram (nunca lê lixo)", () => {
    const fn = [OPS.constructPath, OPS.constructPath, OPS.constructPath];
    const args = [[OPS.stroke, [null], null], [OPS.stroke, undefined, null], [OPS.stroke, caminho(0, 0, 0, 1, 10, 0, 99, 1, 2), null]];
    assert.deepEqual(tracosDaOpList(fn, args, OPS, 1), [{ page: 1, o: "h", c: 0, a: 0, b: 10 }]);
  });
});

describe("montarGrade (colunas pelos rótulos + linhas da tabela por página)", () => {
  const rotulos = [
    { key: "item", x: 48.3, y: 489.4, page: 1 },
    { key: "codigo", x: 85, y: 489.4, page: 1 },
    { key: "descricao", x: 205.8, y: 489.4, page: 1 },
    { key: "unidade", x: 345.5, y: 489.4, page: 1 },
    { key: "quantidade", x: 394.8, y: 489.4, page: 1 },
    { key: "valorUnitario", x: 457.9, y: 485.4, page: 1 },
    { key: "valorTotal", x: 507.3, y: 489.4, page: 1 },
  ];
  const itens = Array.from({ length: 3 }, (_, i) => ({ n: String(i + 1), codigo: ["5241900001"], desc: ["A", "B"] }));

  it("colunas exatas do Centi e as linhas (cabeçalho + itens); total com célula mesclada e rodapé ficam de fora", () => {
    const { tracos } = dfdCenti(itens);
    const g = montarGrade(tracos, rotulos, ["item", "codigo", "descricao"], ["item", "descricao"]);
    assert.ok(g);
    assert.deepEqual(
      g.colunas.map((c) => [c.key, c.x0, c.x1]),
      [
        ["item", 35.4, 78],
        ["codigo", 78, 120.5],
        ["descricao", 120.5, 333.1],
        ["unidade", 333.1, 389.8],
        ["quantidade", 389.8, 446.5],
        ["valorUnitario", 446.5, 503.2],
        ["valorTotal", 503.2, 559.9],
      ],
    );
    assert.equal(g.linhas.get(1)?.length, 4); // cabeçalho + 3 itens
    assert.equal(colunaDe(g, 81.7), "codigo");
    assert.equal(colunaDe(g, 123.1), "descricao");
    assert.equal(colunaDe(g, 580), null);
    assert.equal(linhaDe(g, 1, 489.4), 0); // cabeçalho
    assert.equal(linhaDe(g, 1, 20.8), null); // rodapé: fora da tabela
    assert.equal(linhaDe(g, 2, 400), null); // página sem grade
  });

  it("sem traços, sem coluna obrigatória ou colunas sobrepostas → null (o parser usa a geometria do texto)", () => {
    const { tracos } = dfdCenti(itens);
    assert.equal(montarGrade([], rotulos, ["item"], ["item", "descricao"]), null);
    assert.equal(
      montarGrade(
        tracos,
        rotulos.filter((r) => r.key !== "codigo"),
        ["item", "codigo", "descricao"],
        ["item", "descricao"],
      ),
      null,
    );
    // Só as bordas externas (sem divisórias entre colunas): cada rótulo "vê" a tabela inteira → sobrepostas.
    const soContorno = tracos.filter((t) => t.o === "h" || t.c < 36 || t.c > 559);
    assert.equal(montarGrade(soContorno, rotulos, ["item", "codigo", "descricao"], ["item", "descricao"]), null);
  });
});
