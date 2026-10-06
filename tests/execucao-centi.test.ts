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

test("mesma entidade da Centi", async () => {
  const { mesmaEntidade } = await import("../src/lib/execucao-centi.ts");
  assert.equal(mesmaEntidade("2", "02"), true);
  assert.equal(mesmaEntidade("02", "03"), false);
  assert.equal(mesmaEntidade(null, "2"), false);
});
