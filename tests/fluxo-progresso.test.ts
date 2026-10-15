import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { progressoFluxo, registrarAmostra, tempoRestanteMs, textoDuracao, textoPct } from "../src/lib/fluxo-progresso.ts";

describe("progresso da automação (a % e o tempo restante)", () => {
  it("a % segue o TRABALHO: 2 leituras instantâneas não valem 2/3 de 1.302 DFDs", () => {
    const f = progressoFluxo([{ estado: "ok" }, { estado: "ok" }, { estado: "rodando", fracao: 0.5, peso: 1302 }]);
    assert.ok(Math.abs(f - (2 + 651) / 1304) < 1e-9);
    assert.equal(progressoFluxo([{ estado: "ok" }, { estado: "rodando" }, { estado: "fila" }]), 1 / 3);
    assert.equal(progressoFluxo([]), 0);
    assert.equal(textoPct(0.999), "99%", "nunca 100% antes do fim");
    assert.equal(textoPct(0.999, true), "100%");
  });

  it("tempo restante pelo ritmo real das amostras recentes", () => {
    let a = registrarAmostra([], { t: 0, f: 0 });
    assert.equal(tempoRestanteMs(a, 1000), null, "sem medida: calculando");
    a = registrarAmostra(a, { t: 60_000, f: 0.1 });
    // 10% em 60 s → 90% em 540 s.
    assert.equal(tempoRestanteMs(a, 60_000), 540_000);
    assert.equal(tempoRestanteMs(a, 70_000), 530_000, "o relógio anda entre as amostras");
    // Fora da janela de 2 min: só o ritmo recente conta.
    a = registrarAmostra(a, { t: 200_000, f: 0.5 });
    assert.equal(a[0].t, 200_000 - 140_000);
    assert.deepEqual(registrarAmostra(a, { t: 210_000, f: 0 }), [{ t: 210_000, f: 0 }], "recomeçou");
  });

  it("texto da duração", () => {
    assert.equal(textoDuracao(20_000), "< 1 min");
    assert.equal(textoDuracao(12 * 60_000), "≈ 12 min");
    assert.equal(textoDuracao(65 * 60_000), "≈ 1 h 05 min");
  });
});
