import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { anoEscolhido, EMPENHOS_POR_PEDACO, empenhosDoPacote, type PacoteEmpenhos, resumoEmpenhos } from "../src/lib/empenhos-tela-core.ts";
import { consultaAnosEmpenhos, consultaVersaoEmpenhos, textoPacoteEmpenhos } from "../src/lib/empenhos-tela-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

function banco() {
  const raw = new DatabaseSync(":memory:");
  for (const m of ["0129_centi_apis", "0130_centi_apis_escopo", "0131_empenhos", "0132_centi_lote_passos", "0134_empenhos_conferencia"]) raw.exec(readFileSync(new URL(`../drizzle/${m}.sql`, import.meta.url), "utf8"));
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const ins = raw.prepare(
    `INSERT INTO empenhos (chave, ano, numero, data, orgao_gestor, fornecedor, cpf_cnpj, elemento, fonte, valor_empenhado, valor_anulado, valor_liquidado, valor_pago, saldo_pagar, removido_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return { raw, db, ins };
}

/** O pacote como a rota o devolve (o texto do banco, lido). */
async function pacote(b: ReturnType<typeof banco>, ano: number, removidos = false): Promise<PacoteEmpenhos> {
  const t = await textoPacoteEmpenhos(b.db, ano, removidos);
  assert.ok(t != null);
  return JSON.parse(t) as PacoteEmpenhos;
}

test("tela de empenhos: o pacote compacto do banco volta IGUAL ao que está gravado (nulos, aspas, acentos, removidos)", async () => {
  const b = banco();
  b.ins.run("2026|PMRV|1", 2026, "1", "2026-01-02", "PMRV", 'ACME "LTDA"', "1.234/0001-00", "3.3.90.30 - MATERIAL", null, 100.5, 0, 50, 50, 50.5, null);
  b.ins.run("2026|FMS|2", 2026, "2", null, "FMS", "JOÃO Ç", null, "3.3.90.30 - MATERIAL", "1.07 - SUS", 3042, 10, 0, 0, 3032, null);
  b.ins.run("2026|FMS|3", 2026, "3", "2026-01-02", "FMS", null, null, null, "1.07 - SUS", 7, 0, 7, 7, 0, "2026-05-01");
  b.ins.run("2025|PMRV|9", 2025, "9", "2025-12-30", "PMRV", "X", null, null, null, 1, 0, 0, 0, 1, null);

  const p = await pacote(b, 2026);
  assert.equal(p.n, 2);
  const e = empenhosDoPacote(p);
  assert.deepEqual(
    e.map((x) => [x.numero, x.data, x.orgaoGestor, x.fornecedor, x.cpfCnpj, x.elemento, x.fonte, x.valorEmpenhado, x.saldoPagar]),
    [
      ["1", "2026-01-02", "PMRV", 'ACME "LTDA"', "1.234/0001-00", "3.3.90.30 - MATERIAL", null, 100.5, 50.5],
      ["2", null, "FMS", "JOÃO Ç", null, "3.3.90.30 - MATERIAL", "1.07 - SUS", 3042, 3032],
    ],
  );
  // O texto repetido vai UMA vez no dicionário.
  assert.equal(p.dic.elemento?.length, 1);

  const rem = empenhosDoPacote(await pacote(b, 2026, true));
  assert.deepEqual(rem.map((x) => x.numero), ["3"]);
  assert.deepEqual(empenhosDoPacote(await pacote(b, 2024)), []);

  const anos = await consultaAnosEmpenhos(b.db);
  assert.deepEqual(anos.map((a) => [a.ano, a.n, a.removidos]), [[2026, 2, 1], [2025, 1, 0]]);
  assert.equal(anos[0].soma, 3142.5);

  const r = resumoEmpenhos(e);
  assert.deepEqual(r, { n: 2, empenhado: 3142.5, anulado: 10, liquidado: 50, pago: 50, aPagar: 3082.5 });
});

test("tela de empenhos: vários PEDAÇOS — nenhum empenho some nem repete, na ordem do id", async () => {
  const b = banco();
  const total = EMPENHOS_POR_PEDACO * 2 + 37;
  b.raw.exec("BEGIN");
  for (let i = 1; i <= total; i++) b.ins.run(`2026|O${i % 7}|${i}`, 2026, String(i), `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, `O${i % 7}`, `F${i % 500}`, null, `E${i % 41}`, `S${i % 60}`, i, 0, 0, 0, i, null);
  b.raw.exec("COMMIT");
  const e = empenhosDoPacote(await pacote(b, 2026));
  assert.equal(e.length, total);
  assert.deepEqual(e.map((x) => Number(x.numero)), Array.from({ length: total }, (_, i) => i + 1));
  assert.ok(e.every((x) => x.orgaoGestor === `O${Number(x.numero) % 7}` && x.fonte === `S${Number(x.numero) % 60}` && x.valorEmpenhado === Number(x.numero)));
});

test("tela de empenhos: o ano da URL só vale se existe; senão o mais recente", () => {
  const anos = [
    { ano: 2026, n: 1, soma: 0, removidos: 0, atualizadoEm: null },
    { ano: 2025, n: 1, soma: 0, removidos: 0, atualizadoEm: null },
  ];
  assert.equal(anoEscolhido(anos, "2025"), 2025);
  assert.equal(anoEscolhido(anos, "2019"), 2026);
  assert.equal(anoEscolhido(anos, "x"), 2026);
  assert.equal(anoEscolhido([], "2026"), null);
  // Tupla incompleta não quebra.
  assert.deepEqual(empenhosDoPacote({ n: 1, dic: {}, linhas: [[5, "7"]] })[0].valorPago, 0);
});

test("tela de empenhos: a VERSÃO do ano = a última importação promovida (a memória do Worker só relê com importação nova)", async () => {
  const b = banco();
  assert.equal(await consultaVersaoEmpenhos(b.db, 2026), "0");
  b.raw.exec("INSERT INTO centi_lotes (api_chave, ano, estado) VALUES ('empenhos', 2026, 'promovido'), ('empenhos', 2026, 'parcial'), ('empenhos', 2025, 'promovido')");
  assert.equal(await consultaVersaoEmpenhos(b.db, 2026), "1");
  assert.equal(await consultaVersaoEmpenhos(b.db, 2025), "3");
  b.raw.exec("UPDATE centi_lotes SET concluido_em = '2026-10-20 12:00:00' WHERE id = 1");
  b.ins.run("2026|A|1", 2026, "1", null, "A", null, null, null, null, 1, 0, 0, 0, 1, null);
  assert.equal((await consultaAnosEmpenhos(b.db))[0].atualizadoEm, "2026-10-20 12:00:00");
});
