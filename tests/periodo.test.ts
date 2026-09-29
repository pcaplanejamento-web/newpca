import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intervaloDoPeriodo, noIntervalo, PERIODO_TODO, rotuloPeriodo, textoIntervalo } from "../src/lib/periodo.ts";

// Hoje = terça-feira 29/09/2026.
const HOJE = "2026-09-29";

describe("período → intervalo de dias", () => {
  it("atalhos com o hoje injetado (a semana vai de domingo a sábado)", () => {
    assert.deepEqual(intervaloDoPeriodo(PERIODO_TODO, HOJE), {});
    assert.deepEqual(intervaloDoPeriodo({}, HOJE), {});
    assert.deepEqual(intervaloDoPeriodo({ preset: "hoje" }, HOJE), { de: HOJE, ate: HOJE });
    assert.deepEqual(intervaloDoPeriodo({ preset: "semana" }, HOJE), { de: "2026-09-27", ate: "2026-10-03" });
    // O domingo e o sábado são da MESMA semana; a semana que vira o ano.
    assert.deepEqual(intervaloDoPeriodo({ preset: "semana" }, "2026-09-27"), { de: "2026-09-27", ate: "2026-10-03" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "semana" }, "2026-10-03"), { de: "2026-09-27", ate: "2026-10-03" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "semana" }, "2026-12-31"), { de: "2026-12-27", ate: "2027-01-02" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "mes" }, HOJE), { de: "2026-09-01", ate: "2026-09-30" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "mes" }, "2024-02-10"), { de: "2024-02-01", ate: "2024-02-29" });
  });

  it("ano, mês de um ano e o hoje do aparelho por padrão", () => {
    assert.deepEqual(intervaloDoPeriodo({ ano: 2025 }, HOJE), { de: "2025-01-01", ate: "2025-12-31" });
    assert.deepEqual(intervaloDoPeriodo({ ano: 2026, mes: 12 }, HOJE), { de: "2026-12-01", ate: "2026-12-31" });
    assert.deepEqual(intervaloDoPeriodo({ ano: 2026, mes: 2 }, HOJE), { de: "2026-02-01", ate: "2026-02-28" });
    // Ano/mês fora do calendário são ignorados (nunca um intervalo inventado).
    assert.deepEqual(intervaloDoPeriodo({ ano: 26 }, HOJE), {});
    assert.deepEqual(intervaloDoPeriodo({ ano: 2026, mes: 13 }, HOJE), { de: "2026-01-01", ate: "2026-12-31" });
    // O hoje do aparelho (tolerante à virada da meia-noite durante o teste).
    const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const antes = local(new Date());
    const hoje = intervaloDoPeriodo({ preset: "hoje" });
    assert.ok([antes, local(new Date())].includes(hoje.de ?? ""));
    assert.equal(hoje.de, hoje.ate);
  });

  it("intervalo DE/ATÉ: aberto, invertido (trocado) e datas inválidas ignoradas", () => {
    assert.deepEqual(intervaloDoPeriodo({ preset: "custom", de: "2026-09-01", ate: "2026-09-30" }, HOJE), { de: "2026-09-01", ate: "2026-09-30" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "custom", de: "2026-09-01" }, HOJE), { de: "2026-09-01" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "custom", ate: "2026-09-30" }, HOJE), { ate: "2026-09-30" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "custom", de: "2026-10-05", ate: "2026-09-30" }, HOJE), { de: "2026-09-30", ate: "2026-10-05" });
    assert.deepEqual(intervaloDoPeriodo({ preset: "custom", de: "2026-02-30" }, HOJE), {});
    assert.deepEqual(intervaloDoPeriodo({ preset: "custom", de: "ontem", ate: "2026-09-30" }, HOJE), { ate: "2026-09-30" });
    // O intervalo vale sobre o ano/mês que tenha ficado no valor.
    assert.deepEqual(intervaloDoPeriodo({ ano: 2026, mes: 1, de: "2026-09-10" }, HOJE), { de: "2026-09-10" });
  });
});

describe("dia no intervalo", () => {
  it("sem limites vale sempre (inclusive sem data); com limites, só a data dentro", () => {
    assert.equal(noIntervalo(null, {}), true);
    assert.equal(noIntervalo("2020-01-01", {}), true);
    assert.equal(noIntervalo(null, { de: "2026-09-01" }), false);
    assert.equal(noIntervalo("2026-09-01", { de: "2026-09-01", ate: "2026-09-30" }), true);
    assert.equal(noIntervalo("2026-09-30", { de: "2026-09-01", ate: "2026-09-30" }), true);
    assert.equal(noIntervalo("2026-10-01", { de: "2026-09-01", ate: "2026-09-30" }), false);
    assert.equal(noIntervalo("2026-08-31", { de: "2026-09-01" }), false);
    assert.equal(noIntervalo("2026-08-31", { ate: "2026-09-01" }), true);
  });
});

describe("rótulos do período", () => {
  it("rótulo curto do seletor", () => {
    assert.equal(rotuloPeriodo(PERIODO_TODO), "Todo o período");
    assert.equal(rotuloPeriodo({}), "Todo o período");
    assert.equal(rotuloPeriodo({ preset: "semana" }), "Esta semana");
    assert.equal(rotuloPeriodo({ ano: 2026, mes: 9 }), "Set 2026");
    assert.equal(rotuloPeriodo({ ano: 2026 }), "2026");
    assert.equal(rotuloPeriodo({ preset: "custom", de: "2026-09-01", ate: "2026-09-30" }), "01/09/2026 – 30/09/2026");
    assert.equal(rotuloPeriodo({ preset: "custom", de: "2026-09-30", ate: "2026-09-01" }), "01/09/2026 – 30/09/2026");
    assert.equal(rotuloPeriodo({ preset: "custom", de: "2026-09-29", ate: "2026-09-29" }), "29/09/2026");
    assert.equal(rotuloPeriodo({ preset: "custom", de: "2026-09-01" }), "Desde 01/09/2026");
    assert.equal(rotuloPeriodo({ preset: "custom", ate: "2026-09-30" }), "Até 30/09/2026");
    assert.equal(rotuloPeriodo({ preset: "custom" }), "Todo o período");
  });

  it("intervalo por extenso", () => {
    assert.equal(textoIntervalo({ de: "2026-09-27", ate: "2026-10-03" }), "27/09 a 03/10/2026");
    assert.equal(textoIntervalo({ de: "2026-12-27", ate: "2027-01-02" }), "27/12/2026 a 02/01/2027");
    assert.equal(textoIntervalo({ de: HOJE, ate: HOJE }), "29/09/2026");
    assert.equal(textoIntervalo({ de: "2026-09-01" }), "desde 01/09/2026");
    assert.equal(textoIntervalo({ ate: "2026-09-30" }), "até 30/09/2026");
    assert.equal(textoIntervalo({}), "");
  });
});
