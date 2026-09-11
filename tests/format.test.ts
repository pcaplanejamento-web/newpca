import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brl, brlCompact, dataBR, dec, mesLabel, num, pct } from "../src/lib/format.ts";

// Intl insere espaços não-quebráveis (NBSP/narrow) no pt-BR; normalizamos.
const sp = (s: string) => s.replace(/\s/g, " ");

describe("format (pt-BR)", () => {
  it("brl formata moeda e trata null/undefined como 0", () => {
    assert.equal(sp(brl(1234.5)), "R$ 1.234,50");
    assert.equal(sp(brl(0)), "R$ 0,00");
    assert.equal(sp(brl(null)), "R$ 0,00");
    assert.equal(sp(brl(undefined)), "R$ 0,00");
  });

  it("num e dec", () => {
    assert.equal(sp(num(1234567)), "1.234.567");
    assert.equal(sp(dec(1234.5)), "1.234,50");
  });

  it("brlCompact encurta milhares/milhões/bilhões", () => {
    assert.equal(sp(brlCompact(1_500_000)), "R$ 1,5 mi");
    assert.equal(sp(brlCompact(2500)), "R$ 2,5 mil");
    assert.equal(sp(brlCompact(3_200_000_000)), "R$ 3,2 bi");
    assert.equal(sp(brlCompact(999)), "R$ 999,00");
  });

  it("mesLabel", () => {
    assert.equal(mesLabel(1, 2026), "jan/26");
    assert.equal(mesLabel(12), "dez");
    assert.equal(mesLabel(0), "s/ data");
    assert.equal(mesLabel(13), "s/ data");
    assert.equal(mesLabel(null), "s/ data");
  });

  it("dataBR converte ISO para dd/mm/yyyy", () => {
    assert.equal(dataBR("2026-09-11"), "11/09/2026");
    assert.equal(dataBR("2026-09-11T10:00:00Z"), "11/09/2026");
    assert.equal(dataBR(null), "—");
    assert.equal(dataBR(""), "—");
    assert.equal(dataBR("texto"), "texto");
  });

  it("pct", () => {
    assert.equal(pct(1, 4), "25%");
    assert.equal(pct(1, 3), "33,3%");
    assert.equal(pct(5, 0), "0%");
  });
});
