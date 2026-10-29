import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avancarCursor,
  CONFIG_FROTA_PADRAO,
  type ConfigFrota,
  type CursorFrota,
  esperaDaFalha,
  lerConfigFrota,
  motivoForaDaHora,
  novoPasso,
  proximoTrabalho,
} from "../src/lib/frota-config-core.ts";

// A configuração e a régua da ATUALIZAÇÃO AUTOMÁTICA da frota (Vólus).

const cfg: ConfigFrota = { ...CONFIG_FROTA_PADRAO, clientId: "id", clientSecret: "cifrado", ativa: true, frequenciaMin: 360, diasRecentes: 10, horaInicio: 6, horaFim: 22 };
// 29/10/2026 (quinta) às 12h em Brasília = 15h UTC.
const agora = new Date("2026-10-29T15:00:00Z");
const cursor = (extra: Partial<CursorFrota> = {}): CursorFrota => ({
  contrato: "000617000001",
  tipo: "abastecimento",
  cicloInicio: null,
  proximo: null,
  passoDias: 7,
  falhas: 0,
  esperaAte: null,
  travaAte: null,
  cicloConcluidoEm: null,
  ...extra,
});

test("frota-config: qualquer JSON vira uma configuração válida", () => {
  assert.deepEqual(lerConfigFrota(null), CONFIG_FROTA_PADRAO);
  const c = lerConfigFrota({ frequenciaMin: 5, diasRecentes: 9999, horaInicio: 20, horaFim: 8, ativa: "sim", alertas: { consumoPct: "x" } });
  assert.equal(c.frequenciaMin, 30);
  assert.equal(c.diasRecentes, 366);
  assert.equal(c.horaFim, 21, "o fim do horário vem depois do início");
  assert.equal(c.ativa, false, "só true liga");
  assert.equal(c.alertas.consumoPct, CONFIG_FROTA_PADRAO.alertas.consumoPct);
});

test("frota-config: quando a automática pode rodar", () => {
  assert.equal(motivoForaDaHora(cfg, agora), null);
  assert.match(motivoForaDaHora({ ...cfg, ativa: false }, agora) ?? "", /desligada/);
  assert.match(motivoForaDaHora({ ...cfg, clientId: "" }, agora) ?? "", /credencial/);
  assert.match(motivoForaDaHora({ ...cfg, horaInicio: 13 }, agora) ?? "", /horário/);
  // Sábado, 31/10/2026.
  assert.match(motivoForaDaHora({ ...cfg, diasUteis: true }, new Date("2026-10-31T15:00:00Z")) ?? "", /úteis/);
  assert.equal(motivoForaDaHora({ ...cfg, diasUteis: true }, agora), null);
});

test("frota-config: o próximo trabalho", () => {
  // Cursor novo = ciclo novo dos últimos `diasRecentes` dias, um passo por vez.
  assert.deepEqual(proximoTrabalho([cursor()], cfg, agora), { contrato: "000617000001", tipo: "abastecimento", inicio: "2026-10-20", fim: "2026-10-26", novoCiclo: true });
  // O ciclo em andamento continua (o fim nunca passa de hoje) e vem antes de um ciclo novo.
  const andando = cursor({ tipo: "manutencao", proximo: "2026-10-27", cicloConcluidoEm: "2026-10-28T00:00:00.000Z" });
  assert.deepEqual(proximoTrabalho([cursor(), andando], cfg, agora), { contrato: "000617000001", tipo: "manutencao", inicio: "2026-10-27", fim: "2026-10-29", novoCiclo: false });
  // Em espera ou travado: pula.
  const futuro = "2026-10-29T16:00:00.000Z";
  assert.equal(proximoTrabalho([cursor({ esperaAte: futuro }), cursor({ travaAte: futuro })], cfg, agora), null);
  // Concluído há menos que a frequência: nada; há mais: ciclo novo.
  assert.equal(proximoTrabalho([cursor({ cicloConcluidoEm: "2026-10-29T12:00:00.000Z" })], cfg, agora), null);
  assert.equal(proximoTrabalho([cursor({ cicloConcluidoEm: "2026-10-29T08:00:00.000Z" })], cfg, agora)?.novoCiclo, true);
});

test("frota-config: o ciclo inteiro cobre os dias recentes sem buraco nem sobreposição (também dividindo)", () => {
  let k = cursor();
  const lidos: string[] = [];
  for (let i = 0; i < 50; i++) {
    const t = proximoTrabalho([k], cfg, agora);
    if (!t) break;
    // Na 2ª leitura a resposta não cabe: o passo diminui e o MESMO início é lido de novo, menor.
    if (i === 1) {
      const dias = (Date.parse(t.fim) - Date.parse(t.inicio)) / 86_400_000 + 1;
      k = { ...k, ...(t.novoCiclo ? { proximo: t.inicio } : {}), passoDias: novoPasso(k.passoDias, dias, { dividir: 3 }, 200_000) };
      continue;
    }
    for (let d = Date.parse(t.inicio); d <= Date.parse(t.fim); d += 86_400_000) lidos.push(new Date(d).toISOString().slice(0, 10));
    const proximo = avancarCursor(t.fim, "2026-10-29");
    k = { ...k, proximo, cicloConcluidoEm: proximo ? k.cicloConcluidoEm : agora.toISOString() };
  }
  const esperados = Array.from({ length: 10 }, (_, i) => `2026-10-${String(20 + i).padStart(2, "0")}`);
  assert.deepEqual(lidos, esperados);
  assert.equal(proximoTrabalho([k], cfg, agora), null, "concluído agora: espera a frequência");
});

test("frota-config: o passo e a espera depois de uma falha", () => {
  assert.equal(novoPasso(7, 7, { dividir: 3 }, 200_000), 2);
  assert.equal(novoPasso(1, 1, { dividir: 4 }, 200_000), 1);
  assert.equal(novoPasso(7, 7, { bytes: 10_000 }, 200_000), 14, "sobrou muito: dobra");
  assert.equal(novoPasso(31, 31, { bytes: 10 }, 200_000), 31, "no máximo 31 dias");
  assert.equal(novoPasso(7, 7, { bytes: 150_000 }, 200_000), 7);
  // A resposta LENTA não deixa o passo crescer; o tempo esgotado (ou 522/524) divide ao meio.
  assert.equal(novoPasso(14, 14, { bytes: 1_000, ms: 20_000 }, 200_000), 14, "pequena mas lenta: não cresce");
  assert.equal(novoPasso(14, 14, { bytes: 1_000, ms: 2_000 }, 200_000), 28, "pequena e rápida: dobra");
  assert.equal(novoPasso(28, 24, { lento: true }, 200_000), 12, "não respondeu a tempo: metade dos dias");
  assert.equal(novoPasso(1, 1, { lento: true }, 200_000), 1);
  assert.deepEqual([1, 2, 3, 6, 10].map((f) => esperaDaFalha(f, true)), [2, 4, 8, 60, 60]);
  assert.equal(esperaDaFalha(1, false), 360, "a falha permanente (credencial) espera 6 h");
  assert.equal(avancarCursor("2026-10-28", "2026-10-29"), "2026-10-29");
  assert.equal(avancarCursor("2026-10-29", "2026-10-29"), null);
});

test("frota-config: as cores dos dados — só hex validado; o resto = a cor do tema", async () => {
  const { cssCoresFrota } = await import("../src/lib/frota-config-core.ts");
  assert.deepEqual(lerConfigFrota({}).cores, { combustivel: null, manutencao: null });
  const c = lerConfigFrota({ cores: { combustivel: "#AABBCC", manutencao: "red;}body{x:1" } }).cores;
  assert.deepEqual(c, { combustivel: "#aabbcc", manutencao: null });
  assert.equal(cssCoresFrota(c), ":root{--frota-combustivel:#aabbcc}");
  assert.equal(cssCoresFrota({ combustivel: null, manutencao: null }), "");
});
