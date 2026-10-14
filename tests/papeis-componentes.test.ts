import assert from "node:assert/strict";
import { test } from "node:test";
import { compactarDetalhes, diffDetalhes, resumoDetalhes } from "../src/lib/papeis-detalhes-core.ts";
import { alternarAcaoComponente, coerceComponentes, retirado, vistaPermitida } from "../src/lib/papeis-componentes-core.ts";

test("coerceComponentes: só o catálogo; retirar visualizar retira tudo", () => {
  const r = coerceComponentes({ "dfd.dashboard": ["visualizar"], "x.y": ["visualizar"], "dfd.itens": ["exportar", "lixo"] });
  assert.deepEqual(r["dfd.dashboard"], ["visualizar"]);
  assert.equal(r["x.y"], undefined);
  assert.deepEqual(r["dfd.itens"], ["exportar"]);
  assert.deepEqual(coerceComponentes("lixo"), {});
});

test("retirado/alternar: o admin nunca; liberar outra ação devolve ver", () => {
  let r = alternarAcaoComponente({}, "dfd.itens", "visualizar", false);
  assert.ok(retirado(r, "dfd.itens", "exportar"));
  assert.ok(!retirado(r, "dfd.itens", "exportar", true));
  r = alternarAcaoComponente(r, "dfd.itens", "exportar", true);
  assert.ok(!retirado(r, "dfd.itens", "visualizar"));
});

test("vistaPermitida cai na 1ª permitida", () => {
  assert.equal(vistaPermitida("a", ["a", "b"], (v) => v !== "a"), "b");
  assert.equal(vistaPermitida("a", ["a", "b"], () => true), "a");
});

test("detalhes: compacta, diff e resumo com componentes", () => {
  const d = { componentes: { "pca.orcamento": ["visualizar"] } };
  assert.deepEqual((compactarDetalhes(d as never) as { componentes: unknown }).componentes, { "pca.orcamento": ["visualizar", "exportar"] });
  assert.ok(diffDetalhes({}, d).length > 0);
  assert.ok(resumoDetalhes(d).length > 0);
});

test("exibição: vínculos expandidos vai no papel e não conta como restrição", async () => {
  const m = await import("../src/lib/papeis-detalhes-core.ts");
  const d = m.coerceDetalhes({ exibicao: { vinculosExpandidos: true } });
  assert.equal(d.exibicao.vinculosExpandidos, true);
  assert.deepEqual(m.compactarDetalhes(d).exibicao, { vinculosExpandidos: true });
  assert.equal(m.compactarDetalhes(m.coerceDetalhes({})).exibicao, undefined);
  assert.equal(m.contarRestricoes(d), 0);
});

test("relatório da composição: recorte por unidade", async () => {
  const { recortarRelatorio } = await import("../src/lib/orcamento-relatorio.ts");
  const u = (id: number, sigla: string, cubo: string, orc: number) => ({ id, sigla, nome: sigla, orgao: null, orcamento: orc, lancamentos: 1, noCubo: orc, planejado: 0, vinculos: [{ unidadeCubo: cubo, regra: "", acoes: [], fora: [] }] });
  const s = { lancamentos: 0, valor: 0 };
  const r = {
    pca: { nome: "P", ano: 2027 }, orcamento: { nome: "O", ano: 2027 }, visaoNome: null,
    totais: { cubo: s, foraDaVisao: s, naVisao: s, nasUnidades: { lancamentos: 2, valor: 30 }, semVinculo: s },
    dimensoes: [], retiradoPorUnidadeCubo: [{ unidadeCubo: "A", lancamentos: 1, valor: 1 }, { unidadeCubo: "B", lancamentos: 1, valor: 1 }],
    unidades: [u(1, "X", "A", 10), u(2, "Y", "B", 20)], semVinculo: [], semOrcamento: [], planejadoSemUnidade: 5,
    definicoes: { unidadesCubo: [], unidadesComContratacao: [] },
  };
  const x = recortarRelatorio(r, [2]);
  assert.deepEqual(x.recorte, ["Y"]);
  assert.equal(x.totais.nasUnidades.valor, 20);
  assert.deepEqual(x.retiradoPorUnidadeCubo.map((a) => a.unidadeCubo), ["B"]);
  assert.equal(recortarRelatorio(r, [99]), r);
});
