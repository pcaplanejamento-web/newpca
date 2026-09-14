import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estadoTemporario,
  parseResponsaveis,
  responsavelVigente,
  serializeResponsaveis,
  temporarioVigente,
} from "../src/lib/reparticao-responsaveis.ts";

const HOJE = "2026-06-15";
const temp = (nome: string, inicio: string, fim: string, ato: string | null = null) => ({ nome, inicio, fim, ato });

describe("reparticao-responsaveis (padrão + temporários)", () => {
  it("parse: null/vazio → padrão vazio, sem temporários", () => {
    assert.deepEqual(parseResponsaveis(null), { padrao: "", temporarios: [] });
    assert.deepEqual(parseResponsaveis("   "), { padrao: "", temporarios: [] });
  });

  it("parse: objeto novo → padrão + temporários (descarta sem nome)", () => {
    const raw = JSON.stringify({ padrao: " Ana ", temporarios: [temp("Bia", "2026-01-01", "2026-03-01", "Portaria 1"), temp("", "x", "y")] });
    assert.deepEqual(parseResponsaveis(raw), {
      padrao: "Ana",
      temporarios: [temp("Bia", "2026-01-01", "2026-03-01", "Portaria 1")],
    });
  });

  it("parse: formato ANTIGO (array de nomes) → 1º vira o padrão", () => {
    assert.deepEqual(parseResponsaveis('["Ana","Bia"]'), { padrao: "Ana", temporarios: [] });
  });

  it("parse: formato ANTIGO (string única) → padrão", () => {
    assert.deepEqual(parseResponsaveis("Carlos"), { padrao: "Carlos", temporarios: [] });
  });

  it("serialize: vazio → null; descarta temporários incompletos", () => {
    assert.equal(serializeResponsaveis({ padrao: "  ", temporarios: [] }), null);
    const s = serializeResponsaveis({
      padrao: " Ana ",
      temporarios: [temp(" Bia ", "2026-01-01", "2026-03-01", " P1 "), temp("SemDatas", "", "")],
    });
    assert.deepEqual(JSON.parse(s ?? "null"), { padrao: "Ana", temporarios: [temp("Bia", "2026-01-01", "2026-03-01", "P1")] });
  });

  it("estadoTemporario: agendado / vigente / encerrado", () => {
    assert.equal(estadoTemporario(temp("A", "2026-07-01", "2026-08-01"), HOJE), "agendado");
    assert.equal(estadoTemporario(temp("A", "2026-06-01", "2026-06-30"), HOJE), "vigente");
    assert.equal(estadoTemporario(temp("A", "2026-01-01", "2026-02-01"), HOJE), "encerrado");
    assert.equal(estadoTemporario(temp("A", "", ""), HOJE), "agendado"); // datas pendentes
  });

  it("temporarioVigente / responsavelVigente: temporário no período assume", () => {
    const r = { padrao: "Padrão", temporarios: [temp("Temp", "2026-06-01", "2026-06-30", "Portaria 9")] };
    assert.equal(temporarioVigente(r, HOJE)?.nome, "Temp");
    assert.deepEqual(responsavelVigente(r, HOJE), { nome: "Temp", tipo: "temporario" });
    // fora do período → volta ao padrão
    assert.equal(temporarioVigente(r, "2026-09-01"), null);
    assert.deepEqual(responsavelVigente(r, "2026-09-01"), { nome: "Padrão", tipo: "padrao" });
  });

  it("responsavelVigente: sem ninguém → null", () => {
    assert.equal(responsavelVigente({ padrao: "", temporarios: [] }, HOJE), null);
  });

  it("round-trip serialize→parse", () => {
    const r = { padrao: "Ana", temporarios: [temp("Bia", "2026-01-01", "2026-03-01", "Portaria 1")] };
    assert.deepEqual(parseResponsaveis(serializeResponsaveis(r)), r);
  });
});
