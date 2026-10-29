import assert from "node:assert/strict";
import test from "node:test";
import { anoDaVez, cardNaHora, errosSeguidos, esperaDoErro, MAX_ERROS_AUTO, MINUTOS_DESISTIR_AUTO, proximoPedido } from "../src/lib/empenhos-core.ts";

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

test("atualização automática: os erros esperam (1, 2, 4… min) e só desistem depois de 30 min sem avanço", () => {
  const ped = { periodo: { inicio: "2026-01-08", fim: "2026-01-14" }, pagina: 1 };
  const erro = (em: string): P & { em: string } => ({ inicio: "2026-01-08", fim: "2026-01-14", pagina: 1, estado: "erro", fimPeriodo: false, em });
  const guardando = { ...erro("2026-10-23 15:00:30"), mensagem: "Guardando a página — 1 parte(s) recebida(s)" };
  const agora = Date.parse("2026-10-23T15:01:00Z");
  // 1 erro há 30 s: espera 1 min.
  assert.deepEqual(esperaDoErro([erro("2026-10-23 15:00:30")], ped, agora), { esperar: true, desistir: false });
  // O passo "Guardando a página…" não conta como erro.
  assert.equal(errosSeguidos([erro("2026-10-23 15:00:00"), guardando], ped), 1);
  // 3 erros em 1 minuto: ainda NÃO desiste (o cron roda 2×/min — a falha passageira da Centi não derruba o lote).
  const tres = [erro("2026-10-23 15:00:00"), erro("2026-10-23 15:00:30"), erro("2026-10-23 15:00:50")];
  assert.equal(esperaDoErro(tres, ped, agora).desistir, false);
  // 3 erros com o 1º há mais de 30 min: desiste.
  const velhos = [erro("2026-10-23 14:20:00"), erro("2026-10-23 14:40:00"), erro("2026-10-23 15:00:50")];
  assert.equal(esperaDoErro(velhos, ped, agora).desistir, true);
  assert.ok(MINUTOS_DESISTIR_AUTO >= 30);
  // Sem erro: segue.
  assert.deepEqual(esperaDoErro([], ped, agora), { esperar: false, desistir: false });
  // A leitura fragmentada AVANÇOU depois dos erros velhos: eles não contam (só os posteriores ao avanço).
  assert.equal(esperaDoErro(velhos, ped, agora, "2026-10-23 14:50:00").desistir, false);
  assert.deepEqual(esperaDoErro(velhos, ped, agora, "2026-10-23 15:00:55"), { esperar: false, desistir: false });
  // O "Guardando…" parado há mais de 5 min foi cortado no meio: conta como erro.
  const parado = { ...erro("2026-10-23 14:50:00"), mensagem: "Guardando a página — 1 parte(s) recebida(s)" };
  assert.equal(esperaDoErro([parado], ped, agora).esperar, false);
  assert.equal(esperaDoErro([parado, erro("2026-10-23 15:00:50")], ped, agora).esperar, true);
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

test("atualização automática: depois de ler o 1º dia de uma semana dividida, o próximo é o DIA seguinte — nunca um período novo que se divide de novo", () => {
  const div = (inicio: string, fim: string): P => ({ inicio, fim, pagina: 1, estado: "dividido", fimPeriodo: false });
  // A sequência real: 01–07, 01–04 e 01–02 divididos; 01/01 lido.
  const passos = [div("2026-01-01", "2026-01-07"), div("2026-01-01", "2026-01-04"), div("2026-01-01", "2026-01-02"), ok("2026-01-01", "2026-01-01")];
  assert.deepEqual(proximoPedido(2026, passos, true)?.periodo, { inicio: "2026-01-02", fim: "2026-01-02" });
  // 02/01 lido: as metades já divididas seguem (03–04), depois 05–07.
  assert.deepEqual(proximoPedido(2026, [...passos, ok("2026-01-02", "2026-01-02")], true)?.periodo, { inicio: "2026-01-03", fim: "2026-01-04" });
  assert.deepEqual(proximoPedido(2026, [...passos, ok("2026-01-02", "2026-01-02"), ok("2026-01-03", "2026-01-04")], true)?.periodo, { inicio: "2026-01-05", fim: "2026-01-07" });
  // Lido em parte por outro caminho (a tela leu 01–10): o resto da 2ª semana (11–14).
  assert.deepEqual(proximoPedido(2026, [ok("2026-01-01", "2026-01-10")], true)?.periodo, { inicio: "2026-01-11", fim: "2026-01-14" });
});
