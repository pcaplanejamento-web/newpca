import assert from "node:assert/strict";
import test from "node:test";
import { anoDaVez, cardNaHora, errosSeguidos, MAX_ERROS_AUTO, proximoPedido } from "../src/lib/empenhos-core.ts";

type P = { inicio: string; fim: string; pagina: number; estado: "ok" | "erro" | "dividido"; fimPeriodo: boolean };
const ok = (inicio: string, fim: string, pagina = 1, fimPeriodo = true): P => ({ inicio, fim, pagina, estado: "ok", fimPeriodo });

test("atualização automática: o próximo pedido segue a mesma ordem da importação manual", () => {
  assert.deepEqual(proximoPedido(2026, [], true), { periodo: { inicio: "2026-01-01", fim: "2026-01-07" }, pagina: 1 });
  // A semana lida passa para a próxima; o período começado continua na página seguinte.
  assert.deepEqual(proximoPedido(2026, [ok("2026-01-01", "2026-01-07")], true)?.periodo.inicio, "2026-01-08");
  assert.deepEqual(proximoPedido(2026, [ok("2026-01-01", "2026-01-07", 1, false)], true), { periodo: { inicio: "2026-01-01", fim: "2026-01-07" }, pagina: 2 });
  // Sem {inicio}/{fim}: o ano inteiro de uma vez.
  assert.deepEqual(proximoPedido(2026, [], false), { periodo: { inicio: "2026-01-01", fim: "2026-12-31" }, pagina: 1 });
  assert.equal(proximoPedido(2026, [ok("2026-01-01", "2026-12-31")], false), null);
});

test("atualização automática: o período grande demais é lido nas metades (recursivo), e o ano todo lido = concluir", () => {
  const dividido: P = { inicio: "2026-01-01", fim: "2026-01-07", pagina: 1, estado: "dividido", fimPeriodo: false };
  assert.deepEqual(proximoPedido(2026, [dividido], true)?.periodo, { inicio: "2026-01-01", fim: "2026-01-04" });
  assert.deepEqual(proximoPedido(2026, [dividido, ok("2026-01-01", "2026-01-04")], true)?.periodo, { inicio: "2026-01-05", fim: "2026-01-07" });
  const metade: P = { ...dividido, inicio: "2026-01-01", fim: "2026-01-04" };
  assert.deepEqual(proximoPedido(2026, [dividido, metade], true)?.periodo, { inicio: "2026-01-01", fim: "2026-01-02" });
  const tudo = [ok("2026-01-01", "2026-06-30"), ok("2026-07-01", "2026-12-31")];
  assert.equal(proximoPedido(2026, tudo, true), null);
});

test("atualização automática: conta os erros seguidos do mesmo pedido (o sucesso zera)", () => {
  const ped = { periodo: { inicio: "2026-01-08", fim: "2026-01-14" }, pagina: 1 };
  const erro: P = { inicio: "2026-01-08", fim: "2026-01-14", pagina: 1, estado: "erro", fimPeriodo: false };
  assert.equal(errosSeguidos([ok("2026-01-01", "2026-01-07"), erro, erro], ped), 2);
  assert.equal(errosSeguidos([erro, ok("2026-01-01", "2026-01-07")], ped), 0);
  assert.ok(MAX_ERROS_AUTO >= 2);
});

test("atualização automática: só começa na hora (horário, dia útil, frequência)", () => {
  const api = { frequenciaMin: 120, diasUteis: true, horaInicio: "07:00", horaFim: "19:00", ultimaExecucao: null as string | null };
  const ms = Date.parse("2026-10-23T15:00:00Z");
  assert.equal(cardNaHora(api, { ms, hora: "12:00", diaUtil: true }), true);
  assert.equal(cardNaHora(api, { ms, hora: "06:59", diaUtil: true }), false);
  assert.equal(cardNaHora(api, { ms, hora: "19:01", diaUtil: true }), false);
  assert.equal(cardNaHora(api, { ms, hora: "12:00", diaUtil: false }), false);
  assert.equal(cardNaHora({ ...api, diasUteis: false }, { ms, hora: "12:00", diaUtil: false }), true);
  assert.equal(cardNaHora({ ...api, ultimaExecucao: "2026-10-23 14:00:00" }, { ms, hora: "12:00", diaUtil: true }), false);
  assert.equal(cardNaHora({ ...api, ultimaExecucao: "2026-10-23 13:00:00" }, { ms, hora: "12:00", diaUtil: true }), true);
});

test("atualização automática: o ano da vez — o nunca lido primeiro, depois o lido há mais tempo", () => {
  assert.equal(anoDaVez([2026, 2025], new Map()), 2026);
  assert.equal(anoDaVez([2026, 2025], new Map([[2026, "2026-10-23 10:00:00"]])), 2025);
  assert.equal(anoDaVez([2026, 2025], new Map([[2026, "2026-10-23 10:00:00"], [2025, "2026-10-23 12:00:00"]])), 2026);
});
