import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brl, brlCompact, dataBR, dec, dicaLista, formatBytes, juntarParaCopiar, mesLabel, num, numeroSemAno, pct } from "../src/lib/format.ts";

// Intl insere espaços não-quebráveis (NBSP/narrow) no pt-BR; normalizamos.
const sp = (s: string) => s.replace(/\s/g, " ");

describe("format (pt-BR)", () => {
  it("numeroSemAno: tira só o '/AAAA' do fim do nº do protocolo (zeros à esquerda ficam)", () => {
    assert.equal(numeroSemAno("144756/2026"), "144756");
    assert.equal(numeroSemAno(" 000123 / 2025 "), "000123");
    assert.equal(numeroSemAno("144756/1999"), "144756");
    // Sem ano de 4 dígitos no fim: o texto como está (aparado) — nada que não seja ano é cortado.
    assert.equal(numeroSemAno("144756"), "144756");
    assert.equal(numeroSemAno("144756/26"), "144756/26");
    assert.equal(numeroSemAno("144756/3026"), "144756/3026");
    assert.equal(numeroSemAno("2026/144756"), "2026/144756");
    assert.equal(numeroSemAno("12/2026/2027"), "12/2026");
    assert.equal(numeroSemAno(null), "");
    assert.equal(numeroSemAno(undefined), "");
    assert.equal(numeroSemAno("—"), "—");
  });
  it("juntarParaCopiar: ':' sem espaço, sem vazios/'—'/repetidos, na ordem", () => {
    assert.equal(juntarParaCopiar(["1525", "1549", "1554"]), "1525:1549:1554");
    assert.equal(juntarParaCopiar([" 1525 ", null, "", "—", "15 49", "1525", undefined, "1554"]), "1525:1549:1554");
    assert.equal(juntarParaCopiar([null, "", "  ", "—"]), "");
    assert.equal(juntarParaCopiar([]), "");
  });
  it("dicaLista: um por linha, só os primeiros `max` (o resto = '… e mais N'); formata só os exibidos", () => {
    assert.equal(dicaLista([], String), "");
    assert.equal(dicaLista([1, 2, 3], (n) => `DFD ${n}`), "DFD 1\nDFD 2\nDFD 3");
    let chamadas = 0;
    const muitos = Array.from({ length: 5000 }, (_, i) => i);
    const d = dicaLista(
      muitos,
      (n) => {
        chamadas++;
        return String(n);
      },
      3,
    );
    assert.equal(sp(d), "0 1 2 … e mais 4.997");
    assert.equal(chamadas, 3);
  });

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

  it("formatBytes (base 1024, pt-BR)", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(null), "0 B");
    assert.equal(formatBytes(undefined), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1023), "1023 B");
    assert.equal(formatBytes(1024), "1 KB");
    assert.equal(sp(formatBytes(1536)), "1,5 KB");
    assert.equal(formatBytes(1024 ** 2), "1 MB");
    assert.equal(formatBytes(1024 ** 3), "1 GB");
    assert.equal(sp(formatBytes(-2048)), "-2 KB");
  });
});
