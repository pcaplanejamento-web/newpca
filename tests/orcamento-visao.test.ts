import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aplicarVisao, coerceFiltros, opcoesDaDimensao, resumoVisao } from "../src/lib/orcamento-visao.ts";
import { comparativoPorUnidade, faixaComprometimento, linhaAcima, origemDaLinha, totaisComparativo } from "../src/lib/orcamento-comparativo.ts";

const L = [
  { orgao: "FME", unidade: "SEMED", nomeElemento: "MATERIAL DE CONSUMO", codigoElemento: "339030" },
  { orgao: "FME", unidade: "SEMED", nomeElemento: "VENCIMENTOS", codigoElemento: "319011" },
  { orgao: "FMS", unidade: "SEMUS", nomeElemento: "MATERIAL DE CONSUMO", codigoElemento: "339030" },
  { orgao: "FMS", unidade: null, nomeElemento: "OBRAS", codigoElemento: "449051" },
];

describe("orcamento-visao", () => {
  it("coerceFiltros descarta chaves/valores inválidos e duplicados", () => {
    assert.deepEqual(coerceFiltros('{"orgao":["FME","FME"," "],"xx":["a"],"unidade":"x"}'), { orgao: ["FME"] });
    assert.deepEqual(coerceFiltros("lixo"), {});
  });
  it("dimensões do NOVO CUBO (Função/Programa/Ação/Ficha/Fonte): aceitas no filtro e filtram; ausentes = \"—\"", () => {
    assert.deepEqual(coerceFiltros({ fonte: ["100 - RECURSOS ORDINÁRIOS"], ficha: ["0624"] }), { fonte: ["100 - RECURSOS ORDINÁRIOS"], ficha: ["0624"] });
    const novo = [
      { orgao: "FMACL", fonte: "100 - RECURSOS ORDINÁRIOS", acao: "2191 - MANTER" },
      { orgao: "FMACL", fonte: "150 - FUNDEB", acao: "2191 - MANTER" },
      { orgao: "FME" }, // CUBO antigo: sem as colunas novas
    ];
    assert.equal(aplicarVisao(novo, { fonte: ["100 - recursos ordinarios"] }).length, 1);
    assert.equal(aplicarVisao(novo, { acao: ["2191 - MANTER"] }).length, 2);
    assert.equal(aplicarVisao(novo, { fonte: ["—"] }).length, 1);
    assert.match(resumoVisao({ fonte: ["x", "y"], acao: ["z"] }), /1 ação · 2 fonte/);
  });
  it("OU dentro da dimensão, E entre dimensões; sem filtro = tudo", () => {
    assert.equal(aplicarVisao(L, {}).length, 4);
    assert.equal(aplicarVisao(L, { nomeElemento: ["MATERIAL DE CONSUMO", "OBRAS"] }).length, 3);
    assert.equal(aplicarVisao(L, { nomeElemento: ["material de consumo"], orgao: ["FMS"] }).length, 1);
    assert.equal(aplicarVisao(L, { unidade: ["—"] }).length, 1);
  });
  it("opções conectadas ignoram a própria dimensão", () => {
    const op = opcoesDaDimensao(L, "nomeElemento", { orgao: ["FME"], nomeElemento: ["VENCIMENTOS"] });
    assert.deepEqual(op.map((o) => o.valor), ["MATERIAL DE CONSUMO", "VENCIMENTOS"]);
  });
  it("resumo", () => {
    assert.equal(resumoVisao({ nomeElemento: ["a", "b"], orgao: ["x"] }), "1 órgão · 2 elemento de despesa");
    assert.equal(resumoVisao({}), "Todos os lançamentos");
  });
});

describe("orcamento-comparativo", () => {
  it("faixas", () => {
    assert.equal(faixaComprometimento(50, 100), "ok");
    assert.equal(faixaComprometimento(95, 100), "atencao");
    assert.equal(faixaComprometimento(100, 100), "atencao");
    assert.equal(faixaComprometimento(131, 100), "acima");
    assert.equal(faixaComprometimento(10, 0), "sem-orcamento");
  });
  it("agrupa por unidade, sem vínculo por último, totais", () => {
    const linhas = comparativoPorUnidade(
      [
        { unidadeId: 1, itens: 3, valor: 900 },
        { unidadeId: 2, itens: 1, valor: 200 },
        { unidadeId: 99, itens: 1, valor: 10 },
      ],
      [
        { unidadeId: 1, valor: 1000 },
        { unidadeId: null, valor: 50 },
      ],
      [
        { id: 1, sigla: "SEMUS", nome: "Saúde" },
        { id: 2, sigla: "AMAE", nome: "Água" },
      ],
    );
    assert.deepEqual(linhas.map((l) => l.sigla), ["AMAE", "SEMUS", "Sem vínculo"]);
    const semus = linhas[1];
    assert.equal(semus.diferenca, 100);
    assert.equal(semus.faixa, "atencao");
    assert.ok(linhaAcima(linhas[0]));
    const t = totaisComparativo(linhas);
    assert.equal(t.orcamento, 1050);
    assert.equal(t.planejado, 1110);
    assert.equal(t.acima, 1); // AMAE (planejado sem orçamento)
  });
  it("origem da linha = exatamente o que a linha soma (inclui o Sem vínculo)", () => {
    const planejado = [
      { unidadeId: 1, itens: 3, valor: 900 },
      { unidadeId: 2, itens: 1, valor: 200 },
      { unidadeId: 99, itens: 1, valor: 10 },
      { unidadeId: null, itens: 2, valor: 5 },
    ];
    const orc = [
      { unidadeId: 1, valor: 1000 },
      { unidadeId: null, valor: 50 },
      { unidadeId: 77, valor: 7 },
    ];
    const unidades = [
      { id: 1, sigla: "SEMUS", nome: "Saúde" },
      { id: 2, sigla: "AMAE", nome: "Água" },
    ];
    const linhas = comparativoPorUnidade(planejado, orc, unidades);
    for (const l of linhas) {
      const o = origemDaLinha(l.unidadeId, planejado, orc, unidades);
      assert.equal(o.planejado.reduce((s, p) => s + p.valor, 0), l.planejado);
      assert.equal(o.planejado.reduce((s, p) => s + p.itens, 0), l.contratacoes);
      assert.equal(o.orcamento.reduce((s, x) => s + x.valor, 0), l.orcamento);
    }
    const sem = origemDaLinha(null, planejado, orc, unidades);
    assert.deepEqual(sem.planejado.map((p) => p.unidadeId), [99, null]);
    assert.deepEqual(sem.orcamento.map((x) => x.unidadeId), [null, 77]);
  });
});
