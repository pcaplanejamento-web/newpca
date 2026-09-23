import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aplicarFiltros,
  type ColunaDados,
  contarNaFaixa,
  filtroAtivo,
  indiceNoDominio,
  normalizarFaixa,
  normalizarSelecao,
  opcoesDaBusca,
  predicadoBusca,
  ordenarIndices,
} from "../src/lib/tabela-filtros.ts";

// 6 linhas: sigla (values), estado (multi-valor), data (date), valor (range).
const siglas = ["SMS", "SMS", "SME", "SME", "FMS", "FMS"];
const estados = [["Sem tipo", "Sem prioridade"], ["Regular"], ["Sem tipo"], ["Sem prioridade"], ["Regular"], ["Item sem valor", "Sem tipo"]];
const datas = ["2026-01-10", "2026-05-02", "2025-12-30", "2026-07-15", "", "2027-02-01"];
const valores = [100, 2500.5, null, 90000, 0, 1500];
const cols = (): ColunaDados[] => [
  { tipo: "values", vals: siglas.map((s) => [s]) },
  { tipo: "values", vals: estados },
  { tipo: "date", vals: datas },
  { tipo: "range", vals: valores },
];

describe("aplicarFiltros — filtros conectados (facetados)", () => {
  it("sem filtros: todas as linhas; opções/faixa/anos de todas", () => {
    const r = aplicarFiltros(6, cols(), []);
    assert.deepEqual(r.passam, [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(r.opcoes[0], ["FMS", "SME", "SMS"]);
    assert.deepEqual(r.opcoes[1], ["Item sem valor", "Regular", "Sem prioridade", "Sem tipo"]);
    assert.deepEqual(r.dominios[3], [0, 100, 1500, 2500.5, 90000]); // null fica fora do domínio
    assert.deepEqual(r.anos[2], [2027, 2026, 2025]);
    assert.equal(r.opcoes[2], null);
    assert.equal(r.dominios[0], null);
  });

  it("multi-valor: filtrar por um problema OCULTO no +N acha a linha", () => {
    const r = aplicarFiltros(6, cols(), [undefined, ["Sem prioridade"]]);
    assert.deepEqual(r.passam, [0, 3]); // a linha 0 tem "Sem prioridade" como 2º problema
  });

  it("as opções de uma coluna vêm das linhas que passam nos DEMAIS filtros", () => {
    const r = aplicarFiltros(6, cols(), [["SMS"]]);
    assert.deepEqual(r.passam, [0, 1]);
    // Estado só oferece o que existe em SMS…
    assert.deepEqual(r.opcoes[1], ["Regular", "Sem prioridade", "Sem tipo"]);
    // …mas a própria coluna filtrada segue oferecendo TODAS as siglas (ignora o próprio filtro).
    assert.deepEqual(r.opcoes[0], ["FMS", "SME", "SMS"]);
    assert.deepEqual(r.dominios[3], [100, 2500.5]);
  });

  it("dois filtros: cada coluna ignora só o PRÓPRIO filtro", () => {
    const r = aplicarFiltros(6, cols(), [["SME", "FMS"], ["Sem tipo"]]);
    assert.deepEqual(r.passam, [2, 5]);
    assert.deepEqual(r.opcoes[0], ["FMS", "SME", "SMS"]); // siglas com "Sem tipo"
    assert.deepEqual(r.opcoes[1], ["Item sem valor", "Regular", "Sem prioridade", "Sem tipo"]); // estados de SME/FMS
  });

  it("faixa numérica: mín/máx com tolerância de centavo; nulo não passa com faixa ativa", () => {
    const r = aplicarFiltros(6, cols(), [undefined, undefined, undefined, { min: 100, max: 2500.5 }]);
    assert.deepEqual(r.passam, [0, 1, 5]);
    assert.deepEqual(aplicarFiltros(6, cols(), [undefined, undefined, undefined, { min: 1000 }]).passam, [1, 3, 5]);
  });

  it("datas: intervalo DE/ATÉ (vazio fica fora quando há DE)", () => {
    const r = aplicarFiltros(6, cols(), [undefined, undefined, { de: "2026-01-01", ate: "2026-12-31" }]);
    assert.deepEqual(r.passam, [0, 1, 3]);
  });

  it("ordem fixa de opções (filterOptions) filtrada pela faceta", () => {
    const c: ColunaDados[] = [{ tipo: "values", vals: siglas.map((s) => [s]), ordem: ["SMS", "GAB", "FMS"] }];
    assert.deepEqual(aplicarFiltros(6, c, []).opcoes[0], ["SMS", "FMS"]);
  });
});

describe("filtroAtivo / normalizações", () => {
  it("filtroAtivo por tipo", () => {
    assert.equal(filtroAtivo("values", []), false);
    assert.equal(filtroAtivo("values", ["x"]), true);
    assert.equal(filtroAtivo("date", {}), false);
    assert.equal(filtroAtivo("date", { de: "2026-01-01" }), true);
    assert.equal(filtroAtivo("range", {}), false);
    assert.equal(filtroAtivo("range", { max: 0 }), true);
    assert.equal(filtroAtivo("none", ["x"]), false);
  });
  it("normalizarSelecao: vazia ou TODAS as opções ⇒ sem filtro", () => {
    assert.equal(normalizarSelecao([], ["a", "b"]), null);
    assert.equal(normalizarSelecao(["b", "a"], ["a", "b"]), null);
    assert.deepEqual(normalizarSelecao(["a", "a"], ["a", "b"]), ["a"]);
  });
  it("normalizarFaixa: domínio inteiro (valor cheio) ⇒ sem filtro; mín > máx digitado = faixa vazia", () => {
    const dom = [0, 100, 1500];
    assert.equal(normalizarFaixa({ min: 0, max: 1500 }, dom), null);
    assert.equal(normalizarFaixa({}, dom), null);
    assert.deepEqual(normalizarFaixa({ min: 1500, max: 100 }, dom), { min: 1500, max: 100 });
    assert.deepEqual(normalizarFaixa({ min: 100 }, dom), { min: 100 });
    assert.equal(normalizarFaixa(null, dom), null);
  });
  it("normalizarFaixa: o lado NÃO mexido (no extremo da faceta) não vira limite", () => {
    // Faceta atual [100, 2500.5] (outro filtro ativo): arrastar só o MÁX não grava o mín 100 — sem o outro
    // filtro, o valor 0 continua passando.
    const dom = [100, 1500, 2500.5];
    assert.deepEqual(normalizarFaixa({ min: 100, max: 1500 }, dom), { max: 1500 });
    assert.deepEqual(normalizarFaixa({ min: 1500, max: 2500.5 }, dom), { min: 1500 });
  });
  it("contarNaFaixa: a contagem do painel = o que o filtro mostra (faixa vazia = 0)", () => {
    const dom = [0, 100, 1500, 90000];
    assert.equal(contarNaFaixa(dom, 200, 1000), 0);
    assert.equal(contarNaFaixa(dom, 100, 1500), 2);
    assert.equal(contarNaFaixa(dom, undefined, undefined), 4);
    assert.equal(contarNaFaixa(dom, 100000, undefined), 0);
  });
  it("indiceNoDominio: posição da barra para mín/máx", () => {
    const dom = [0, 100, 1500, 90000];
    assert.equal(indiceNoDominio(dom, undefined, "min"), 0);
    assert.equal(indiceNoDominio(dom, undefined, "max"), 3);
    assert.equal(indiceNoDominio(dom, 50, "min"), 1);
    assert.equal(indiceNoDominio(dom, 2000, "max"), 2);
    assert.equal(indiceNoDominio([], 5, "min"), 0);
  });
});

describe("opcoesDaBusca — busca dos filtros múltiplos (vários de uma vez com \":\")", () => {
  const nums = ["1168", "168", "170", "1700", "174", "2"];
  it("\"168:170:174\" marca EXATAMENTE esses (igual vence o contém), na ordem das opções", () => {
    assert.deepEqual(opcoesDaBusca(nums, "168:170:174"), ["168", "170", "174"]);
    assert.deepEqual(opcoesDaBusca(nums, "174 : 168"), ["168", "174"]);
  });
  it("termo sem igual cai no CONTÉM; \":\" sobrando e termos vazios são ignorados", () => {
    assert.deepEqual(opcoesDaBusca(["Sem tipo", "Sem prioridade", "Regular"], "regular:sem"), ["Sem tipo", "Sem prioridade", "Regular"]);
    assert.deepEqual(opcoesDaBusca(nums, "168:"), ["168"]);
    assert.deepEqual(opcoesDaBusca(nums, "::170::"), ["170"]);
  });
  it("um termo só = CONTÉM, sem acento e sem caixa; o texto inteiro com \":\" que existe numa opção vale inteiro", () => {
    assert.deepEqual(opcoesDaBusca(["SAÚDE", "EDUCAÇÃO", "Saudável"], "saude"), ["SAÚDE"]);
    assert.deepEqual(opcoesDaBusca(["12/09/2026 10:30", "12/09/2026 11:00"], "10:30"), ["12/09/2026 10:30"]);
    assert.deepEqual(opcoesDaBusca(nums, "16"), ["1168", "168"]);
  });
  it("busca vazia devolve TODAS; nada casa ⇒ vazio", () => {
    assert.deepEqual(opcoesDaBusca(nums, "  "), nums);
    assert.deepEqual(opcoesDaBusca(nums, "999:888"), []);
  });
});

describe("predicadoBusca — busca de linhas (vários de uma vez com \":\")", () => {
  it("contém sem acento/caixa; com \":\" casa QUALQUER termo; vazia = sem filtro", () => {
    const p = predicadoBusca("5241947270:cadeira");
    assert.ok(p);
    assert.equal(p(["5241947270", "PAINEL"]), true);
    assert.equal(p(["1111", "CADEIRA GIRATÓRIA"]), true);
    assert.equal(p(["2222", "MESA"]), false);
    assert.equal(predicadoBusca("saude")?.(["SECRETARIA DE SAÚDE"]), true);
    assert.equal(predicadoBusca("  "), null);
    assert.equal(predicadoBusca("10:30")?.(["12/09 10:30"]), true);
  });
});

describe("ordenarIndices", () => {
  it("numérico quando dá, texto natural senão; vazios SEMPRE no fim", () => {
    const chaves = ["10", "9", "", "100", null, "2"];
    assert.deepEqual(ordenarIndices([0, 1, 2, 3, 4, 5], chaves, "asc"), [5, 1, 0, 3, 2, 4]);
    assert.deepEqual(ordenarIndices([0, 1, 2, 3, 4, 5], chaves, "desc"), [3, 0, 1, 5, 2, 4]);
    assert.deepEqual(ordenarIndices([0, 1, 2], ["DFD 10", "DFD 9", "DFD 100"], "asc"), [1, 0, 2]);
    assert.deepEqual(ordenarIndices([0, 1, 2], [3.5, null, 1], "desc"), [0, 2, 1]);
  });
  it("o traço \"—\" (célula sem dado) e só-espaços também vão para o fim", () => {
    assert.deepEqual(ordenarIndices([0, 1, 2, 3], ["—", "DFD-S", " ", "DFD-O"], "asc"), [3, 1, 0, 2]);
    assert.deepEqual(ordenarIndices([0, 1, 2, 3], ["—", "DFD-S", " ", "DFD-O"], "desc"), [1, 3, 0, 2]);
  });
});
