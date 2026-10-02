import assert from "node:assert/strict";
import { test } from "node:test";
import {
  comparativoPorOrgao,
  comparativoPorUnidade,
  origemDaLinha,
  origemDoOrgao,
  rotuloUnidadeComparativo,
  siglasDivididas,
  type UnidadeRef,
} from "../src/lib/orcamento-comparativo.ts";

// O caso do print: duas unidades FMMA — os DFDs numa, o vínculo do CUBO na outra.
const unidades: UnidadeRef[] = [
  { id: 1, sigla: "SEMED", nome: "Secretaria de Educação", orgaoId: 1, orgaoSigla: "PMRV" },
  { id: 4, sigla: "FMMA", nome: "Fundo Municipal do Meio Ambiente", orgaoId: 2, orgaoSigla: "FMMA" },
  { id: 5, sigla: "FMMA", nome: "Fundo do Meio Ambiente (antiga)", orgaoId: 1, orgaoSigla: "PMRV", oculta: true },
];
const orgaos = [
  { id: 1, sigla: "PMRV", nome: "Prefeitura" },
  { id: 2, sigla: "FMMA", nome: "Fundo Municipal do Meio Ambiente" },
];
const planejado = [
  { unidadeId: 1, itens: 3, valor: 1000 },
  { unidadeId: 4, itens: 2, valor: 87200 },
  { unidadeId: null, itens: 1, valor: 50 },
];
const orc = [
  { unidadeId: 1, valor: 5000 },
  { unidadeId: 5, valor: 2812500 },
  { unidadeId: 99, valor: 10 }, // unidade fora do cadastro = sem vínculo
];

test("unidades com a MESMA sigla não se fundem e levam o órgão", () => {
  const ls = comparativoPorUnidade(planejado, orc, unidades);
  const fmma = ls.filter((l) => l.sigla === "FMMA");
  assert.equal(fmma.length, 2);
  assert.deepEqual(
    fmma.map((l) => [l.unidadeId, l.orgaoSigla, l.planejado, l.orcamento, l.oculta]),
    [
      [4, "FMMA", 87200, 0, false],
      [5, "PMRV", 0, 2812500, true],
    ],
  );
  assert.equal(ls.at(-1)?.unidadeId, null); // "Sem vínculo" por último
  assert.equal(ls.at(-1)?.planejado, 50);
  assert.equal(ls.at(-1)?.orcamento, 10);
  assert.equal(rotuloUnidadeComparativo(fmma[1]), "FMMA — Fundo do Meio Ambiente (antiga) (PMRV)");
});

test("o ÓRGÃO é a soma das unidades dele; sem vínculo à parte", () => {
  const ls = comparativoPorUnidade(planejado, orc, unidades);
  const os = comparativoPorOrgao(ls, orgaos);
  const pmrv = os.find((o) => o.chave === "o1");
  const fmma = os.find((o) => o.chave === "o2");
  assert.ok(pmrv && fmma);
  assert.equal(pmrv.unidades, 2);
  assert.equal(pmrv.planejado, 1000);
  assert.equal(pmrv.orcamento, 5000 + 2812500);
  assert.equal(pmrv.contratacoes, 3);
  assert.equal(fmma.planejado, 87200);
  assert.equal(fmma.orcamento, 0);
  assert.equal(fmma.faixa, "sem-orcamento");
  assert.equal(os.at(-1)?.chave, "sem");
  const total = (xs: { planejado: number; orcamento: number }[]) => xs.reduce((s, x) => s + x.planejado + x.orcamento, 0);
  assert.equal(total(os), total(ls));
});

test("siglasDivididas acusa o FMMA repartido", () => {
  const ls = comparativoPorUnidade(planejado, orc, unidades);
  const d = siglasDivididas(ls);
  assert.equal(d.length, 1);
  assert.equal(d[0].sigla, "FMMA");
  assert.deepEqual(d[0].comPlanejado.map((l) => l.unidadeId), [4]);
  assert.deepEqual(d[0].comOrcamento.map((l) => l.unidadeId), [5]);
  // Vínculo corrigido (CUBO na unidade 4): uma linha só, nada a acusar.
  const corrigido = comparativoPorUnidade(planejado, orc.map((o) => (o.unidadeId === 5 ? { ...o, unidadeId: 4 } : o)), unidades);
  assert.equal(corrigido.filter((l) => l.sigla === "FMMA").length, 1);
  assert.equal(siglasDivididas(corrigido).length, 0);
});

test("a origem (unidade e órgão) soma igual à linha", () => {
  const ls = comparativoPorUnidade(planejado, orc, unidades);
  for (const l of ls) {
    const o = origemDaLinha(l.unidadeId, planejado, orc, unidades);
    assert.equal(o.planejado.reduce((s, p) => s + p.valor, 0), l.planejado);
    assert.equal(o.orcamento.reduce((s, p) => s + p.valor, 0), l.orcamento);
  }
  for (const l of comparativoPorOrgao(ls, orgaos)) {
    const o = origemDoOrgao(l.chave, planejado, orc, unidades);
    assert.equal(o.planejado.reduce((s, p) => s + p.valor, 0), l.planejado);
    assert.equal(o.orcamento.reduce((s, p) => s + p.valor, 0), l.orcamento);
  }
});
