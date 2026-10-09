import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estadoTemporario,
  padroesInativos,
  responsaveisVigentes,
  temporariosVigentes,
} from "../src/lib/reparticao-responsaveis.ts";

const HOJE = "2026-06-15";
const nom = (tipo: "portaria" | "decreto" | "lei" | null = null, numero = "", link = "") => ({ tipo, numero, link });
const resp = (nome: string, matricula = "", funcao = "", nomeacao = nom()) => ({ nome, matricula, funcao, nomeacao });
const temp = (nome: string, inicio: string, fim: string, over: Partial<ReturnType<typeof resp>> = {}) => ({
  ...resp(nome),
  ...over,
  inicio,
  fim,
});

describe("reparticao-responsaveis (N padrões + N temporários; matrícula/função/nomeação)", () => {
  it("estadoTemporario: agendado / vigente / encerrado", () => {
    assert.equal(estadoTemporario(temp("A", "2026-07-01", "2026-08-01"), HOJE), "agendado");
    assert.equal(estadoTemporario(temp("A", "2026-06-01", "2026-06-30"), HOJE), "vigente");
    assert.equal(estadoTemporario(temp("A", "2026-01-01", "2026-02-01"), HOJE), "encerrado");
  });

  it("temporário no período assume; padrões ficam inativos", () => {
    const r = { padroes: [resp("Padrão")], temporarios: [temp("Temp", "2026-06-01", "2026-06-30")] };
    assert.equal(temporariosVigentes(r, HOJE).length, 1);
    assert.equal(padroesInativos(r, HOJE), true);
    assert.deepEqual(
      responsaveisVigentes(r, HOJE).map((v) => `${v.tipo}:${v.resp.nome}`),
      ["temporario:Temp"],
    );
    // fora do período → volta aos padrões
    assert.equal(padroesInativos(r, "2026-09-01"), false);
    assert.deepEqual(
      responsaveisVigentes(r, "2026-09-01").map((v) => `${v.tipo}:${v.resp.nome}`),
      ["padrao:Padrão"],
    );
  });

  it("vários padrões vigentes quando não há temporário no período", () => {
    const r = { padroes: [resp("Ana"), resp("Bia")], temporarios: [] };
    assert.deepEqual(responsaveisVigentes(r, HOJE).map((v) => v.resp.nome), ["Ana", "Bia"]);
  });
});
