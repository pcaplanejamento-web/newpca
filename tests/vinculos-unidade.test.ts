import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unidadesDoOrcamento, type VinculoOrcamento } from "../src/lib/orcamento-vinculo.ts";
import { blocosVinculosDaLinha, semVinculoPorAlvo, textoSemVinculo, vinculosDaLinha } from "../src/lib/vinculos-unidade.ts";

const itens = [
  { orgao: "FA", unidade: "2 - FMAS", acao: "2101 - CRAS", valorInicial: 100 },
  { orgao: "FA", unidade: "2 - FMAS", acao: "2102 - CREAS", valorInicial: 50 },
  { orgao: "FA", unidade: "2 - FMAS", acao: "2103 - CONSELHO", valorInicial: 20 },
  { orgao: "GA", unidade: "9 - GAB", acao: "2001 - GABINETE", valorInicial: 7 },
];
const unidades = unidadesDoOrcamento(itens);
const fmas = unidades.find((u) => u.texto === "2 - FMAS") ?? unidades[0];
const acao = (t: string) => fmas.acoes.find((a) => a.texto === t)?.chave ?? "";
// FMAS: o CRAS vai à unidade 1; o CREAS à 2; o CONSELHO fica sem vínculo. GAB sem vínculo nenhum.
const vinculos: VinculoOrcamento[] = [
  { id: 1, chave: fmas.chave, texto: fmas.texto, alvoId: 1, acoes: [acao("2101 - CRAS")], acoesFora: [] },
  { id: 2, chave: fmas.chave, texto: fmas.texto, alvoId: 2, acoes: [acao("2102 - CREAS")], acoesFora: [] },
];

describe("vínculos de uma unidade cadastrada (a linha do PCA)", () => {
  it("todas as ações com o destino, o valor que chega e as sem vínculo separadas", () => {
    const v = vinculosDaLinha(unidades, vinculos, 1);
    assert.equal(v.ligadas.length, 1);
    assert.deepEqual(
      v.ligadas[0].acoes.map((a) => [a.acao.texto, a.alvoId]),
      [
        ["2101 - CRAS", 1],
        ["2102 - CREAS", 2],
        ["2103 - CONSELHO", null],
      ],
    );
    assert.equal(v.valorVinculado, 100);
    assert.deepEqual(v.semVinculo.map((p) => p.acoes.map((a) => a.texto)), [["2103 - CONSELHO"]]);
    assert.equal(v.acoesSemVinculo, 1);
  });
  it("a linha Sem vínculo: TODO o orçamento; a dica diz quem está sem vínculo", () => {
    const v = vinculosDaLinha(unidades, vinculos, null);
    assert.equal(v.ligadas.length, 0);
    assert.equal(v.acoesSemVinculo, 2);
    assert.equal(v.valorSemVinculo, 27);
    assert.equal(textoSemVinculo(v.semVinculo), "2 - FMAS: 2103 - CONSELHO\n9 - GAB: 2001 - GABINETE");
    assert.match(textoSemVinculo(v.semVinculo, 1), /e mais 1 ação/);
  });
  it("por unidade cadastrada: as sem vínculo das unidades do orçamento ligadas a ela", () => {
    const m = semVinculoPorAlvo(unidades, vinculos);
    assert.deepEqual([...m.keys()].sort(), [1, 2]);
    assert.equal(m.get(1)?.[0].acoes[0].texto, "2103 - CONSELHO");
  });
  it("PDF: destaques, a tabela por unidade com o destino e as sem vínculo", () => {
    const b = blocosVinculosDaLinha({ titulo: "Vínculos · FMAS", nome: "Fundo", anoOrcamento: "2027" }, vinculosDaLinha(unidades, vinculos, 1), (id) => `U${id}`);
    const tabelas = b.filter((x) => x.tipo === "tabela");
    assert.equal(tabelas.length, 2);
    const t1 = tabelas[0];
    assert.ok(t1.tipo === "tabela");
    assert.deepEqual(t1.linhas.map((l) => l.celulas[1]), ["U1", "U2", "Sem vínculo"]);
  });
});
