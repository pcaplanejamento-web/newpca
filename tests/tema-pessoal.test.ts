import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { lerPrefsTema, minutosAteTroca, noIntervaloEscuro, PREFS_PADRAO, SCRIPT_TEMA, temaDoModo, type PrefsTema } from "../src/lib/tema-pessoal-core.ts";

const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));

test("lerPrefsTema: inválido vira o padrão", () => {
  assert.deepEqual(lerPrefsTema(null), PREFS_PADRAO);
  assert.deepEqual(lerPrefsTema({ modo: "x", tom: "y", inicio: "25:00", fim: "7" }), PREFS_PADRAO);
  assert.equal(lerPrefsTema({ modo: "escuro", tom: "preto" }).tom, "preto");
});

test("intervalo escuro atravessa a meia-noite; início = fim = nunca", () => {
  assert.equal(noIntervaloEscuro(m("23:00"), "18:00", "06:00"), true);
  assert.equal(noIntervaloEscuro(m("05:59"), "18:00", "06:00"), true);
  assert.equal(noIntervaloEscuro(m("06:00"), "18:00", "06:00"), false);
  assert.equal(noIntervaloEscuro(m("12:00"), "08:00", "13:00"), true);
  assert.equal(noIntervaloEscuro(m("12:00"), "10:00", "10:00"), false);
});

test("temaDoModo e próxima troca", () => {
  const p: PrefsTema = { ...PREFS_PADRAO, modo: "personalizado", inicio: "19:00", fim: "07:00" };
  assert.equal(temaDoModo(p, m("20:00")), "dark");
  assert.equal(temaDoModo(p, m("08:00")), "light");
  assert.equal(temaDoModo({ ...p, modo: "sistema" }, 0), "system");
  assert.equal(temaDoModo({ ...p, modo: "site" }, m("23:00")), "light");
  assert.equal(minutosAteTroca(p, m("18:30")), 30);
  assert.equal(minutosAteTroca({ ...p, modo: "escuro" }, 0), null);
});

test("o script antes da pintura usa a MESMA regra", () => {
  const casos: [Partial<PrefsTema>, number][] = [
    [{ modo: "claro" }, 600], [{ modo: "escuro" }, 600], [{ modo: "sistema" }, 600], [{ modo: "site" }, 1300],
    [{ modo: "horario" }, m("19:00")], [{ modo: "horario" }, m("10:00")],
    [{ modo: "personalizado", inicio: "19:00", fim: "07:00" }, m("06:30")], [{ modo: "personalizado", inicio: "19:00", fim: "07:00" }, m("12:00")],
  ];
  for (const [parcial, agora] of casos) {
    const prefs = { ...PREFS_PADRAO, tom: "azul", ...parcial } as PrefsTema;
    const store = new Map<string, string>([["aparencia:pessoa", JSON.stringify(prefs)]]);
    const attrs: Record<string, string> = {};
    class D extends Date { getHours() { return Math.floor(agora / 60); } getMinutes() { return agora % 60; } }
    vm.runInNewContext(SCRIPT_TEMA, {
      Date: D,
      JSON,
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      document: { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } },
    });
    assert.equal(store.get("theme"), temaDoModo(prefs, agora), JSON.stringify(parcial));
    assert.equal(attrs["data-escuro"], "azul");
  }
});

test("o script sem preferências não toca no tema", () => {
  const store = new Map<string, string>();
  vm.runInNewContext(SCRIPT_TEMA, { Date, JSON, localStorage: { getItem: () => null, setItem: (k: string, v: string) => store.set(k, v) }, document: {} });
  assert.equal(store.size, 0);
});
