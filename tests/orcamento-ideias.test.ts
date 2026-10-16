import assert from "node:assert/strict";
import test from "node:test";
import { comparativoPorOrgao, comparativoPorUnidade } from "../src/lib/orcamento-comparativo.ts";
import { lerGruposOrcamento, motivoGruposInvalidos, refsDosGrupos, sugerirGrupos } from "../src/lib/orcamento-grupos.ts";
import { colunasXlsxIniciais } from "../src/lib/exportar-tabela.ts";
import { situacaoVinculos } from "../src/lib/vinculos-unidade.ts";

const unidades = [
  { id: 1, sigla: "SECULT", nome: "Secretaria de Cultura", orgaoId: 10 },
  { id: 2, sigla: "FMC", nome: "Fundo de Cultura", orgaoId: 11 },
  { id: 3, sigla: "SEMED", nome: "Educação", orgaoId: 12 },
];
const planejado = [
  { unidadeId: 1, itens: 1, valor: 100 },
  { unidadeId: 2, itens: 1, valor: 50 },
  { unidadeId: 3, itens: 1, valor: 30 },
];
const orc = [
  { unidadeId: 1, valor: 80, codigoElemento: "3.3.90.30", nomeElemento: "MATERIAL" },
  { unidadeId: 2, valor: 120, codigoElemento: "3.3.90.39", nomeElemento: "SERVIÇOS" },
  { unidadeId: 2, valor: 10, codigoElemento: "3.3.90.30", nomeElemento: "MATERIAL" },
  { unidadeId: 3, valor: 40, codigoElemento: "3.3.90.30", nomeElemento: "MATERIAL" },
];

test("grupo orçamentário soma as unidades; a de fora fica sozinha (Σ grupo = Σ unidades)", () => {
  const grupos = lerGruposOrcamento([{ id: 1, nome: "Cultura", unidades: [1, 2] }]);
  const r = refsDosGrupos(unidades, grupos);
  const linhas = comparativoPorOrgao(comparativoPorUnidade(planejado, orc, r.unidades), r.orgaos);
  const cultura = linhas.find((l) => l.sigla === "Cultura");
  assert.equal(cultura?.planejado, 150);
  assert.equal(cultura?.orcamento, 210);
  assert.equal(cultura?.unidades, 2);
  assert.equal(linhas.find((l) => l.sigla === "SEMED")?.orcamento, 40);
  assert.equal(linhas.reduce((s, l) => s + l.orcamento, 0), 250);
});

test("grupos: uma unidade em um grupo, nome e ≥ 2 unidades", () => {
  const ids = new Set([1, 2, 3]);
  assert.equal(motivoGruposInvalidos([{ id: 1, nome: "A", unidades: [1, 2] }], ids), null);
  assert.match(motivoGruposInvalidos([{ id: 1, nome: "A", unidades: [1, 2] }, { id: 2, nome: "B", unidades: [2, 3] }], ids) ?? "", /um grupo só/);
  assert.match(motivoGruposInvalidos([{ id: 1, nome: "A", unidades: [1] }], ids) ?? "", /duas/);
  assert.match(motivoGruposInvalidos([{ id: 1, nome: "A", unidades: [1, 9] }], ids) ?? "", /não existe/);
  assert.deepEqual(lerGruposOrcamento([{ id: 1, nome: "A", unidades: [1, 2] }, { id: 2, nome: "B", unidades: [2, 3] }]).length, 1);
  assert.deepEqual(sugerirGrupos([{ chave: "x", alvoId: 2 }, { chave: "x", alvoId: 1 }, { chave: "y", alvoId: 3 }], []), [[1, 2]]);
});

test("situação dos vínculos da linha", () => {
  assert.equal(situacaoVinculos({ unidadeId: null, orcamento: 5 }, 0), "Sem vínculo");
  assert.equal(situacaoVinculos({ unidadeId: 1, orcamento: 5 }, 2), "Com ações sem vínculo");
  assert.equal(situacaoVinculos({ unidadeId: 1, orcamento: 5 }, 0), "Vinculada");
  assert.equal(situacaoVinculos({ unidadeId: 1, orcamento: 0 }, 0), "Sem orçamento");
});

test("colunas do XLSX: o padrão = as do PDF; a escolha salva vale enquanto as colunas existem", () => {
  const todas = ["a", "b", "c"];
  assert.deepEqual(colunasXlsxIniciais(todas, ["a", "c"], null), ["a", "c"]);
  assert.deepEqual(colunasXlsxIniciais(todas, ["a", "c"], ["b"]), ["b"]);
  assert.deepEqual(colunasXlsxIniciais(todas, ["a"], ["z"]), ["a"]);
});
