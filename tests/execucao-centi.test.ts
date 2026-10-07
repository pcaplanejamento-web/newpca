import assert from "node:assert/strict";
import { test } from "node:test";
import { chavePlanejamento, classeExecucao, planoExecucao, situacoesDaGrade } from "../src/lib/execucao-centi.ts";

test("classe da situação da CM002", () => {
  assert.equal(classeExecucao("Executado"), "executado");
  assert.equal(classeExecucao("EXECUTADA"), "executado");
  assert.equal(classeExecucao("Cancelado"), "cancelado");
  assert.equal(classeExecucao("Não executado"), "outro");
  assert.equal(classeExecucao("Em andamento"), "outro");
  assert.equal(classeExecucao(null), null);
});

test("grade da CM002 → planejamento → situação (ID = nº de planejamento)", () => {
  const m = situacoesDaGrade(
    ["ID", "DATA INICIAL", "CÓDIGO", "SITUAÇÃO"],
    [{ valores: ["17", "01/04/2026", "03.40.000", "Cancelado"] }, { valores: ["0018", "", "", "Executado"] }, { valores: ["17", "", "", "Executado"] }, ["", "", "", "x"]],
  );
  assert.deepEqual([...m], [["17", "Cancelado"], ["18", "Executado"]]);
  assert.equal(situacoesDaGrade(["PROTOCOLO"], [{ valores: ["1"] }]).size, 0);
  assert.equal(chavePlanejamento(" 0154 "), "154");
});

test("plano: só grava o que mudou; ausente e sem planejamento contados", () => {
  const m = new Map([["18", "Executado"], ["30", "Cancelado"]]);
  const r = planoExecucao(
    [
      { id: 1, numero: "100", planejamento: "18", execucaoCenti: null },
      { id: 2, numero: "101", planejamento: "030", execucaoCenti: "Cancelado" },
      { id: 3, numero: "102", planejamento: "99", execucaoCenti: null },
      { id: 4, numero: "103", planejamento: null, execucaoCenti: null },
    ],
    m,
  );
  assert.deepEqual(r.atualizar, [{ id: 1, situacao: "Executado" }]);
  assert.equal(r.linhas.length, 3);
  assert.equal(r.linhas.find((l) => l.id === 3)?.situacao, null);
  assert.equal(r.semPlanejamento, 1);
});


test("entidade cadastrada no formato da aberta", async () => {
  const { formatoEntidade } = await import("../src/lib/automacao-centi-core.ts");
  assert.equal(formatoEntidade("2", "02"), "02");
  assert.equal(formatoEntidade("03", "2"), "3");
  assert.equal(formatoEntidade("3", null), "3");
});

// CM002 pela API: as peças puras da extensão (centi-anexo.js).
import { readFileSync as lerArq } from "node:fs";
import vmCm from "node:vm";
function pecasCm002() {
  const ctx: Record<string, unknown> = { URL };
  vmCm.runInNewContext(lerArq("extensao-centi/centi-anexo.js", "utf8"), ctx);
  const p = Number(/const PROTOCOLO = (\d+)/.exec(lerArq("extensao-centi/centi-main.js", "utf8"))?.[1]);
  return ctx[`__pcaCentiAnexo_p${p}`] as {
    planejamentosCm002: (j: unknown) => { id: string; situacao: string; finalidade: string; centroCusto: string }[] | null;
    semPaginacao: (c: string, b: unknown) => { caminho: string; corpo: unknown };
    comReparticoes: (b: unknown, n: string[]) => { corpo: { Data: { Reparticoes: { Id: number; selected: boolean }[] } }; achadas: string[]; faltam: string[] } | null;
  };
}

test("CM002 pela API: a lista reconhecida pela forma, todas as linhas, a Situação por extenso", () => {
  const { planejamentosCm002 } = pecasCm002();
  const itens = Array.from({ length: 700 }, (_, i) => ({
    Id: i + 1,
    Situacao: { Id: 2, Descricao: i === 0 ? "Cancelado" : "Executado" },
    Finalidade: `PCA - 2026 - ${i}`,
    CentroCusto: { Descricao: "PM RV" },
  }));
  const r = planejamentosCm002({ Data: { Items: itens, Total: 700 } });
  assert.equal(r?.length, 700);
  assert.deepEqual(JSON.parse(JSON.stringify(r?.[0])), { id: "1", situacao: "Cancelado", finalidade: "PCA - 2026 - 0", centroCusto: "PM RV" });
  assert.equal(planejamentosCm002({ Items: [{ Id: 1, Nome: "x" }] }), null);
});

test("CM002 pela API: a consulta repetida sem paginação (corpo e URL)", () => {
  const { semPaginacao } = pecasCm002();
  const r = semPaginacao("restauth/list?entity=9&take=50&skip=100", { Take: 50, Skip: 50, Filtros: [{ Campo: "x" }], Page: 3 });
  assert.equal(r.caminho, "restauth/list?entity=9&take=100000&skip=0");
  assert.deepEqual(JSON.parse(JSON.stringify(r.corpo)), { Take: 100000, Skip: 0, Filtros: [{ Campo: "x" }], Page: 1 });
});

test("Tela Protocolo pela API: as repartições vão no pedido (postdata) e sem paginação", () => {
  const { comReparticoes, semPaginacao } = pecasCm002();
  const corpo = {
    Data: { Reparticoes: [{ Id: 1, Descricao: "PCA - COORDENADOR (JHONE)", selected: false }, { Id: 2, Descricao: "OUTRA", selected: true }] },
    ItensPerPage: 20,
    Method: "x",
    Page: 3,
  };
  const p = semPaginacao("restauth/postdata", corpo).corpo as { ItensPerPage: number; Page: number };
  assert.equal(p.ItensPerPage, 100000);
  assert.equal(p.Page, 1);
  const r = comReparticoes(corpo, ["pca - coordenador (jhone)"]);
  assert.deepEqual(r?.corpo.Data.Reparticoes.map((x) => [x.Id, x.selected]), [[1, true], [2, false]]);
  assert.deepEqual(r?.faltam, []);
  assert.deepEqual(comReparticoes(corpo, ["NÃO EXISTE"])?.faltam, ["NÃO EXISTE"]);
  assert.equal(comReparticoes({ Data: {} }, ["X"]), null);
});
