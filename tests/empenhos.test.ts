import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  chaveEmpenho,
  conferirLote,
  continuarLendo,
  corpoDaPagina,
  dataIso,
  lerPaginaEmpenhos,
  linhaEmpenho,
  MAX_PAGINAS,
  valor,
} from "../src/lib/empenhos-core.ts";
import { comandoContarPagina, comandoGuardarPagina, comandosFecharLote, comandosPromover, contagemDaPromocao } from "../src/lib/empenhos-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

const reg = (numero: string, extra: Record<string, unknown> = {}) => ({ Numero: numero, OrgaoGestor: "PREFEITURA", ValorEmpenhado: 100, ...extra });

function banco() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(readFileSync(new URL("../drizzle/0131_empenhos.sql", import.meta.url), "utf8"));
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = (ano = 2026) => Number(raw.prepare("INSERT INTO centi_lotes (api_chave, ano) VALUES ('empenhos', ?) RETURNING id").get(ano)?.id);
  return { raw, db, novoLote };
}

async function guardar(b: ReturnType<typeof banco>, lote: number, pagina: number, regs: Record<string, unknown>[], total: number | null = null) {
  const p = lerPaginaEmpenhos(JSON.stringify(regs.map((r, i) => (i === 0 && total != null ? { ...r, TotalRegistros: total } : r))), 2026);
  await b.db.batch([comandoGuardarPagina(b.db, lote, pagina, p.linhas), comandoContarPagina(b.db, lote, pagina, p.recebidos, p.recusados, p.total)]);
  return p;
}

test("empenhos: valores, datas e a chave (a MESMA da tabela)", () => {
  assert.equal(valor(1234.5), 1234.5);
  assert.equal(valor("1.234,56"), 1234.56);
  assert.equal(valor("1,234.56"), 1234.56);
  assert.equal(valor(""), 0);
  assert.equal(valor(null), 0);
  assert.equal(valor(Number.NaN), 0);
  assert.equal(dataIso("02/01/2026"), "2026-01-02");
  assert.equal(dataIso("2/1/2026 10:30:00"), "2026-01-02");
  assert.equal(dataIso("2026-03-31T00:00:00"), "2026-03-31");
  assert.equal(dataIso("31/02/2026"), null);
  assert.equal(dataIso("x"), null);
  assert.equal(chaveEmpenho(2026, "FMS", "12/2026"), "2026|FMS|12/2026");
});

test("empenhos: registro sem número é RECUSADO (nunca vira 0) e o espaço extra some", () => {
  assert.deepEqual(linhaEmpenho({ Numero: "  ", OrgaoGestor: "X" }, 2026), { recusado: "sem número" });
  const l = linhaEmpenho({ Numero: " 15 ", OrgaoGestor: " FUNDO  DE SAÚDE ", Id: "77", Historico: "a\n b" }, 2026);
  assert.ok("linha" in l);
  assert.equal(l.linha.chave, "2026|FUNDO DE SAÚDE|15");
  assert.equal(l.linha.srcId, 77);
  assert.equal(l.linha.historico, "a b");
  const semId = linhaEmpenho({ Numero: "1", Id: "abc" }, 2026);
  assert.ok("linha" in semId && semId.linha.srcId === null && semId.linha.orgaoGestor === "");
});

test("empenhos: leitura da página — total, recusados e repetidos contados; resposta inválida para", () => {
  const p = lerPaginaEmpenhos(JSON.stringify([reg("1", { TotalRegistros: "1530" }), reg("1"), reg(""), reg("2")]), 2026);
  assert.equal(p.recebidos, 4);
  assert.equal(p.linhas.length, 2);
  assert.equal(p.recusados, 1);
  assert.equal(p.repetidos, 1);
  assert.equal(p.total, 1530);
  assert.equal(lerPaginaEmpenhos(JSON.stringify({ data: [reg("9")] }), 2026).linhas.length, 1);
  assert.throws(() => lerPaginaEmpenhos("<html>", 2026), /não é JSON/);
  assert.throws(() => lerPaginaEmpenhos('{"x":1}', 2026), /lista de registros/);
});

test("empenhos: o corpo de cada página (a 1ª sem `pagina`, como a Centi espera)", () => {
  const params = '{"dataInicio":"01/01/{ano}","dataFim":"31/12/{ano}"}';
  assert.deepEqual(corpoDaPagina(params, 2026, 1), { dataInicio: "01/01/2026", dataFim: "31/12/2026" });
  assert.deepEqual(corpoDaPagina(params, 2026, 3), { dataInicio: "01/01/2026", dataFim: "31/12/2026", pagina: 3 });
  assert.deepEqual(corpoDaPagina('{"p":"{pagina}","a":"{ano}"}', 2025, 1), { p: 1, a: 2025 });
  assert.throws(() => corpoDaPagina("{", 2026, 1), /JSON/);
});

test("empenhos: quando continuar e a CONFERÊNCIA (falha no meio ou página repetida nunca é 'completo')", () => {
  const sit = (recebidos: number, unicos: number, totalInformado: number | null, paginas = 1, recusados = 0) => ({ recebidos, unicos, recusados, totalInformado, paginas });
  assert.equal(continuarLendo(sit(100, 100, 300), { recebidos: 100, novos: 100 }), true);
  assert.equal(continuarLendo(sit(300, 300, 300, 3), { recebidos: 100, novos: 100 }), false);
  assert.equal(continuarLendo(sit(100, 100, 300, 2), { recebidos: 0, novos: 0 }), false);
  assert.equal(continuarLendo(sit(200, 100, null, 2), { recebidos: 100, novos: 0 }), false);
  assert.equal(continuarLendo(sit(10, 10, 9999, MAX_PAGINAS), { recebidos: 10, novos: 10 }), false);
  assert.deepEqual(conferirLote(sit(300, 300, 300, 3)), { completo: true });
  assert.deepEqual(conferirLote(sit(300, 298, 300, 3, 2)), { completo: true }, "os recusados (sem número) também contam no total da Centi");
  const repetida = conferirLote(sit(300, 200, 300, 3));
  assert.equal(repetida.completo, false, "recebidos = total com uma página REPETIDA não é completo");
  assert.match((repetida as { motivo: string }).motivo, /200 distintos de 300 .*100 vieram repetidos/);
  assert.match((conferirLote(sit(200, 200, 300, 2)) as { motivo: string }).motivo, /200 distintos de 300/);
  assert.match((conferirLote(sit(200, 200, null, 2)) as { motivo: string }).motivo, /não informou/);
});

test("empenhos (D1 real): páginas no staging, chave repetida no lote fica uma, contagem do lote", async () => {
  const b = banco();
  const lote = b.novoLote();
  await guardar(b, lote, 1, [reg("1"), reg("2"), reg("")], 4);
  await guardar(b, lote, 2, [reg("2"), reg("3")]);
  const l = b.raw.prepare("SELECT * FROM centi_lotes WHERE id = ?").get(lote) as Record<string, number>;
  assert.equal(l.paginas, 2);
  assert.equal(l.recebidos, 5);
  assert.equal(l.recusados, 1);
  assert.equal(l.unicos, 3);
  assert.equal(l.total_informado, 4);
  const s = b.raw.prepare("SELECT chave, pagina, valor_empenhado FROM empenhos_staging ORDER BY chave").all() as Record<string, unknown>[];
  assert.deepEqual(
    s.map((x) => `${x.chave}@${x.pagina}`),
    ["2026|PREFEITURA|1@1", "2026|PREFEITURA|2@1", "2026|PREFEITURA|3@2"],
  );
  assert.equal(s[0].valor_empenhado, 100);
});

test("empenhos (D1 real): 500 linhas numa página = um comando só (json_each), valores e textos intactos", async () => {
  const b = banco();
  const lote = b.novoLote();
  const regs = Array.from({ length: 500 }, (_, i) => reg(String(i + 1), { Historico: `Aquisição "${i}" — d'água`, ValorPago: "1.000,25" }));
  await guardar(b, lote, 1, regs, 500);
  const n = b.raw.prepare("SELECT COUNT(*) n, SUM(valor_pago) p FROM empenhos_staging").get() as { n: number; p: number };
  assert.equal(n.n, 500);
  assert.equal(n.p, 500_125);
  assert.equal((b.raw.prepare("SELECT historico FROM empenhos_staging WHERE numero = '7'").get() as { historico: string }).historico, `Aquisição "6" — d'água`);
});

test("empenhos (D1 real): PROMOVER grava, atualiza, marca removido o que sumiu e reativa o que voltou", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await guardar(b, l1, 1, [reg("1"), reg("2"), reg("3")], 3);
  const c1 = await contagemDaPromocao(b.db, l1, 2026);
  assert.deepEqual(c1, { inseridos: 3, atualizados: 0, removidos: 0 });
  await b.db.batch(comandosPromover(b.db, l1, 2026, c1) as never);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos").get() as { n: number }).n, 3);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos_staging").get() as { n: number }).n, 0);

  // 2ª importação: o 3 sumiu, o 1 mudou de valor, o 4 é novo.
  const l2 = b.novoLote();
  await guardar(b, l2, 1, [reg("1", { ValorEmpenhado: 999 }), reg("2"), reg("4")], 3);
  const c2 = await contagemDaPromocao(b.db, l2, 2026);
  assert.deepEqual(c2, { inseridos: 1, atualizados: 2, removidos: 1 });
  await b.db.batch(comandosPromover(b.db, l2, 2026, c2) as never);
  const e = Object.fromEntries((b.raw.prepare("SELECT numero, valor_empenhado, removido_em, lote_id FROM empenhos").all() as Record<string, unknown>[]).map((x) => [x.numero, x]));
  assert.equal(e["1"].valor_empenhado, 999);
  assert.equal(e["1"].lote_id, l2);
  assert.ok(e["3"].removido_em, "o que sumiu da Centi ganha removido_em (não é apagado)");
  assert.equal(e["4"].removido_em, null);
  const lote2 = b.raw.prepare("SELECT estado, inseridos, atualizados, removidos FROM centi_lotes WHERE id = ?").get(l2) as Record<string, unknown>;
  assert.deepEqual({ ...lote2 }, { estado: "promovido", inseridos: 1, atualizados: 2, removidos: 1 });

  // 3ª: o 3 volta — perde o removido_em.
  const l3 = b.novoLote();
  await guardar(b, l3, 1, [reg("1"), reg("2"), reg("3"), reg("4")], 4);
  await b.db.batch(comandosPromover(b.db, l3, 2026, await contagemDaPromocao(b.db, l3, 2026)) as never);
  assert.equal((b.raw.prepare("SELECT removido_em FROM empenhos WHERE numero = '3'").get() as { removido_em: string | null }).removido_em, null);
});

test("empenhos (D1 real): outro ano nunca é marcado como removido; lote fechado sem promover não toca na tabela", async () => {
  const b = banco();
  b.raw.exec("INSERT INTO empenhos (chave, ano, numero, orgao_gestor) VALUES ('2025|PREFEITURA|1', 2025, '1', 'PREFEITURA')");
  const l = b.novoLote();
  await guardar(b, l, 1, [reg("9")], 1);
  await b.db.batch(comandosPromover(b.db, l, 2026, await contagemDaPromocao(b.db, l, 2026)) as never);
  assert.equal((b.raw.prepare("SELECT removido_em FROM empenhos WHERE ano = 2025").get() as { removido_em: string | null }).removido_em, null);

  const parcial = b.novoLote();
  await guardar(b, parcial, 1, [reg("50")], 9);
  await b.db.batch(comandosFecharLote(b.db, parcial, "parcial", "Faltam registros") as never);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos WHERE numero = '50'").get() as { n: number }).n, 0);
  assert.equal((b.raw.prepare("SELECT COUNT(*) n FROM empenhos_staging").get() as { n: number }).n, 0);
  assert.equal((b.raw.prepare("SELECT estado FROM centi_lotes WHERE id = ?").get(parcial) as { estado: string }).estado, "parcial");
  // Página que chega DEPOIS de fechado não reabre a contagem.
  await guardar(b, parcial, 2, [reg("51")]);
  assert.equal((b.raw.prepare("SELECT recebidos FROM centi_lotes WHERE id = ?").get(parcial) as { recebidos: number }).recebidos, 1);
});
