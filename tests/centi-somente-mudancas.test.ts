import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { alteracoesDoRegistro, camposDaAlteracao, valorDoCampo } from "../src/lib/centi-alteracoes-core.ts";
import { comandoLimparAlteracoes, consultaAlteracoes } from "../src/lib/centi-alteracoes-sql.ts";
import { lerPaginaEmpenhos, type PassoNovo } from "../src/lib/empenhos-core.ts";
import {
  CONF_EMPENHOS,
  comandoRecontarLote,
  comandoRegistrarPasso,
  comandosConferirAssinatura,
  comandosPromover,
  consultaAssinaturas,
  consultaUltimoPasso,
  contagemDaPromocao,
} from "../src/lib/empenhos-sql.ts";
import { hashLinha, hashTupla, paresDaParte, partesComIguais } from "../src/lib/importacao-partes-core.ts";
import { lerPaginaLiquidacoes } from "../src/lib/liquidacoes-core.ts";
import { comandosConferirLiquidacoes } from "../src/lib/liquidacoes-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

/**
 * A IMPORTAÇÃO QUE SÓ GRAVA O QUE MUDOU (v1.241.0) — no driver D1 REAL sobre `node:sqlite`: a assinatura de cada registro,
 * os pares dos iguais conferidos no banco, a remoção em DOIS tempos (ausente → removido) e o histórico das alterações.
 */

const LEITOR = 1;
const reg = (numero: string, extra: Record<string, unknown> = {}) => ({ Numero: numero, OrgaoGestor: "PREFEITURA", ValorEmpenhado: 100, Fornecedor: "ACME", ...extra });

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'); INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos')");
  raw.exec("INSERT INTO empenho_card_vinculos (card_id, orgao_gestor, orgao_id) VALUES (1, 'PREFEITURA', 1)");
  // Conta TODA escrita nas tabelas da importação (o limite diário de escritas do D1 no plano gratuito).
  raw.exec(`CREATE TABLE escritas (t TEXT); CREATE TRIGGER e1 AFTER INSERT ON empenhos_staging BEGIN INSERT INTO escritas VALUES ('staging'); END;
    CREATE TRIGGER e2 AFTER UPDATE ON empenhos BEGIN INSERT INTO escritas VALUES ('empenhos'); END;`);
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = () => Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano) VALUES (1, 2026) RETURNING id").get()?.id);
  const n = (q: string) => Number((raw.prepare(q).get() as { n: number }).n);
  return { raw, db, novoLote, n };
}

const passoBase = (recebidos: number): PassoNovo => ({ inicio: "2026-01-01", fim: "2026-12-31", pagina: 1, estado: "ok", fimPeriodo: true, status: 200, bytes: 1, ms: 1, recebidos, novos: recebidos, recusados: 0, repetidos: 0, total: recebidos, soma: 0, mensagem: null, corpo: "{}" });

/** Uma página COMO A ROTA FAZ: a assinatura de cada linha (no servidor), o que o navegador mandou como PAR, a conferência. */
async function pagina(b: ReturnType<typeof banco>, lote: number, regs: Record<string, unknown>[], comoPar: (chave: string) => string | null = () => null) {
  const linhas = lerPaginaEmpenhos(JSON.stringify(regs), 2026).linhas;
  const pares = linhas.flatMap((l) => {
    const h = comoPar(l.chave);
    return h ? [[l.chave, h] as [string, string]] : [];
  });
  const chavesPar = new Set(pares.map((p) => p[0]));
  const inteiras = linhas.filter((l) => !chavesPar.has(l.chave)).map((l) => ({ ...l, hash: hashLinha("empenhos", l, LEITOR) }));
  const c = comandosConferirAssinatura(b.db, CONF_EMPENHOS, lote, 1, 1, inteiras, pares, []);
  const res = (await b.db.batch([comandoRegistrarPasso(b.db, lote, passoBase(linhas.length)), ...c.cmds, ...c.depois, comandoRecontarLote(b.db, lote), consultaUltimoPasso(b.db, lote)] as never)) as Record<string, unknown>[][];
  const r = res.at(-1)?.[0] ?? {};
  return { novos: r.resNovos, alterados: r.resAlterados, iguais: r.resIguais };
}

async function promover(b: ReturnType<typeof banco>, lote: number, regra: "marcar" | "apagar" = "marcar") {
  const c = await contagemDaPromocao(b.db, lote, 1, 2026, LEITOR);
  await b.db.batch(comandosPromover(b.db, lote, 1, 2026, LEITOR, regra, c) as never);
  return c;
}

test("assinatura: a mesma linha, a mesma assinatura; muda um campo ou o leitor, muda a assinatura", () => {
  const [l] = lerPaginaEmpenhos(JSON.stringify([reg("1")]), 2026).linhas;
  assert.equal(hashLinha("empenhos", l, 1), hashLinha("empenhos", { ...l }, 1));
  assert.notEqual(hashLinha("empenhos", l, 1), hashLinha("empenhos", { ...l, valorEmpenhado: 101 }, 1));
  assert.notEqual(hashLinha("empenhos", l, 1), hashLinha("empenhos", l, 2), "o leitor novo regrava");
  assert.match(hashTupla(["x"], 1), /^[0-9a-z]{8,14}$/);
  assert.equal(new Set(Array.from({ length: 5000 }, (_, i) => hashTupla([i, "a"], 1))).size, 5000, "sem colisão em 5 mil");
});

test("partes: o que tem a assinatura gravada vai só como o PAR; o servidor confere os pares", () => {
  const ls = lerPaginaEmpenhos(JSON.stringify([reg("1"), reg("2"), reg("3")]), 2026).linhas;
  const gravados = new Map([[ls[0].chave, hashLinha("empenhos", ls[0], 1)], [ls[1].chave, "outra"]]);
  const [p] = partesComIguais("empenhos", ls, gravados, 1);
  assert.equal(p.tuplas.length, 2, "o 2 mudou e o 3 é novo: inteiros");
  assert.deepEqual(p.iguais.map((x) => x[0]), [ls[0].chave]);
  assert.equal(partesComIguais("empenhos", [], new Map(), 1).length, 1, "página vazia = uma parte vazia");
  // 12 mil iguais = 3 partes de pares (5 mil cada), sem tuplas.
  const muitas = Array.from({ length: 12_000 }, (_, i) => ({ chave: `k${i}` }));
  const gm = new Map(muitas.map((l) => [l.chave, hashLinha("empenhos", l, 1)]));
  assert.deepEqual(partesComIguais("empenhos", muitas, gm, 1).map((x) => x.iguais.length), [5000, 5000, 2000]);
  assert.equal(paresDaParte([["a", "abc12345"]], new Set()).ok, true);
  assert.equal(paresDaParte([["a", "ABC"]], new Set()).ok, false, "assinatura fora do formato");
  assert.equal(paresDaParte([["a", "abc12345"]], new Set(["a"])).ok, false, "a chave já veio inteira");
  assert.equal(paresDaParte([["a", "abc12345"], ["a", "abc12345"]], new Set()).ok, false, "repetida");
});

test("D1 real: a releitura IDÊNTICA não escreve nada no staging nem nos registros — inteira ou só como pares", async () => {
  const b = banco();
  const l1 = b.novoLote();
  assert.deepEqual(await pagina(b, l1, [reg("1"), reg("2"), reg("3")]), { novos: 3, alterados: 0, iguais: 0 });
  await promover(b, l1);
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE hash IS NOT NULL"), 3, "a promoção grava a assinatura");
  b.raw.exec("DELETE FROM escritas");
  const antes = b.raw.prepare("SELECT numero, atualizado_em, lote_id FROM empenhos ORDER BY numero").all();
  // 2ª: inteira (o servidor calcula a assinatura e descarta o igual).
  const l2 = b.novoLote();
  assert.deepEqual(await pagina(b, l2, [reg("1"), reg("2"), reg("3")]), { novos: 0, alterados: 0, iguais: 3 });
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas"), 0, "nenhuma linha no staging");
  assert.deepEqual(await promover(b, l2), { inseridos: 0, atualizados: 0, removidos: 0, ausentes: 0, fora: 0 });
  // 3ª: só PARES (o navegador viu as assinaturas gravadas).
  const gravados = new Map(Object.entries(JSON.parse((await consultaAssinaturas(b.db, "empenhos", 1, 2026))[0].j) as Record<string, string>));
  assert.equal(gravados.size, 3, "as assinaturas gravadas, num texto montado no banco");
  const l3 = b.novoLote();
  assert.deepEqual(await pagina(b, l3, [reg("1"), reg("2"), reg("3")], (k) => gravados.get(k) ?? null), { novos: 0, alterados: 0, iguais: 3 });
  assert.equal(b.n(`SELECT unicos n FROM centi_lotes WHERE id = ${l3}`), 3, "os pares contam na conferência com a Centi");
  assert.equal(b.n(`SELECT soma n FROM centi_lote_passos WHERE lote_id = ${l3}`), 300, "a soma dos pares vem do gravado");
  await promover(b, l3);
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas"), 0, "nada escrito nos empenhos nem no staging");
  assert.deepEqual(b.raw.prepare("SELECT numero, atualizado_em, lote_id FROM empenhos ORDER BY numero").all(), antes);
});

test("D1 real: o PAR que não confere (assinatura errada) não entra — a conferência acusa a falta, nada se perde", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await pagina(b, l1, [reg("1"), reg("2")]);
  await promover(b, l1);
  const l2 = b.novoLote();
  const r = await pagina(b, l2, [reg("1"), reg("2", { ValorEmpenhado: 999 })], () => "assinaturaerrada");
  assert.deepEqual(r, { novos: 0, alterados: 0, iguais: 0 });
  assert.equal(b.n(`SELECT unicos n FROM centi_lotes WHERE id = ${l2}`), 0, "faltam 2 de 2: o lote não fecha completo");
});

test("D1 real: um campo alterado = 1 linha no staging + 1 no HISTÓRICO, só com aquele campo (o valor de antes guardado)", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await pagina(b, l1, [reg("1"), reg("2")]);
  await promover(b, l1);
  b.raw.exec("DELETE FROM escritas");
  const l2 = b.novoLote();
  assert.deepEqual(await pagina(b, l2, [reg("1", { ValorEmpenhado: 250.5 }), reg("2")]), { novos: 0, alterados: 1, iguais: 1 });
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas WHERE t = 'staging'"), 1);
  await promover(b, l2);
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas WHERE t = 'empenhos'"), 1, "só o que mudou é regravado");
  const id = b.n("SELECT id n FROM empenhos WHERE numero = '1'");
  const alt = alteracoesDoRegistro(await consultaAlteracoes(b.db, "empenho", id));
  assert.equal(alt.length, 1);
  assert.equal(alt[0].acao, "alterado");
  assert.deepEqual(alt[0].campos, [{ campo: "valorEmpenhado", rotulo: "Valor empenhado", antes: valorDoCampo("valorEmpenhado", 100), depois: valorDoCampo("valorEmpenhado", 250.5) }]);
  assert.equal(alt[0].loteId, l2);
  assert.equal(b.n("SELECT COUNT(*) n FROM centi_alteracoes"), 1, "o igual e o novo não geram histórico");
});

test("D1 real: o que some fica AUSENTE (valendo); some de novo = a regra (marcar/apagar); volta = restaurado", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await pagina(b, l1, [reg("1"), reg("2"), reg("3")]);
  await promover(b, l1);
  // 2ª: o 2 e o 3 não vieram — ausentes, ainda valendo.
  const l2 = b.novoLote();
  await pagina(b, l2, [reg("1")]);
  const c2 = await promover(b, l2);
  assert.deepEqual({ r: c2.removidos, a: c2.ausentes }, { r: 0, a: 2 });
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE removido_em IS NULL"), 3, "nada sai da tabela na 1ª ausência");
  assert.equal(b.n(`SELECT COUNT(*) n FROM empenhos WHERE ausente_desde_lote = ${l2}`), 2);
  assert.equal(b.n(`SELECT ausentes n FROM centi_lotes WHERE id = ${l2}`), 2);
  // 3ª: o 2 volta (restaurado); o 3 some de novo (removido).
  const l3 = b.novoLote();
  assert.deepEqual(await pagina(b, l3, [reg("1"), reg("2")]), { novos: 0, alterados: 1, iguais: 1 }, "o ausente que volta é regravado (sai da ausência)");
  const c3 = await promover(b, l3);
  assert.deepEqual({ r: c3.removidos, a: c3.ausentes }, { r: 1, a: 0 });
  const e = Object.fromEntries((b.raw.prepare("SELECT numero, removido_em, ausente_desde_lote, id FROM empenhos").all() as { numero: string; removido_em: string | null; ausente_desde_lote: number | null; id: number }[]).map((x) => [x.numero, x]));
  assert.deepEqual([e["2"].removido_em, e["2"].ausente_desde_lote], [null, null], "o 2 voltou");
  assert.ok(e["3"].removido_em, "o 3 sumiu de novo: removido");
  assert.deepEqual(alteracoesDoRegistro(await consultaAlteracoes(b.db, "empenho", e["2"].id)).map((x) => x.acao), ["restaurado", "ausente"]);
  assert.deepEqual(alteracoesDoRegistro(await consultaAlteracoes(b.db, "empenho", e["3"].id)).map((x) => x.acao), ["removido", "ausente"]);
  // Promover de novo o mesmo lote não faz nada.
  b.raw.exec("DELETE FROM escritas");
  await b.db.batch(comandosPromover(b.db, l3, 1, 2026, LEITOR, "marcar", c3) as never);
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas"), 0);
  // A retenção do histórico.
  b.raw.exec("UPDATE centi_alteracoes SET em = datetime('now', '-400 days') WHERE acao = 'ausente'");
  await b.db.batch([comandoLimparAlteracoes(b.db, 365)] as never);
  assert.equal(b.n("SELECT COUNT(*) n FROM centi_alteracoes WHERE acao = 'ausente'"), 0);
});

test("D1 real: liquidação SEM destino nunca entra no staging — só a chave, na lista do passo", async () => {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO empenho_cards (id, nome, tipo) VALUES (3, 'Liquidações', 'liquidacoes')");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const lote = Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano, modo, orgaos_centi) VALUES (3, 2025, 'liquidacoes', '[9]') RETURNING id").get()?.id);
  const linhas = lerPaginaLiquidacoes(JSON.stringify([{ Id: 1, NumeroEmpenho: "77", Valor: "10,00", DataLiquidacao: "01/03/2025" }]), 2025).linhas;
  const c = comandosConferirLiquidacoes(db, lote, 3, 1, 9, linhas.map((l) => ({ ...l, hash: hashLinha("liquidacoes", l, 1) })));
  await db.batch([comandoRegistrarPasso(db, lote, { ...passoBase(1), inicio: "2025-01-01", fim: "2025-12-31" }), ...c.cmds, ...c.depois, comandoRecontarLote(db, lote)] as never);
  assert.equal(Number((raw.prepare("SELECT COUNT(*) n FROM liquidacoes_staging").get() as { n: number }).n), 0);
  const l = raw.prepare(`SELECT unicos, fora FROM centi_lotes WHERE id = ${lote}`).get() as { unicos: number; fora: number };
  assert.deepEqual({ ...l }, { unicos: 1, fora: 1 }, "conta na conferência como sem destino");
});

test("histórico: a leitura tolera JSON ruim e formata o valor como a tela", () => {
  assert.deepEqual(camposDaAlteracao("x"), []);
  assert.deepEqual(camposDaAlteracao('[{"c":"data","a":"2026-01-02","d":null}]'), [{ campo: "data", rotulo: "Data", antes: "02/01/2026", depois: "—" }]);
  assert.equal(valorDoCampo("anulado", 1), "Sim");
  assert.deepEqual(alteracoesDoRegistro([{ id: 1, acao: "outra", em: "", loteId: null, campos: null }]), []);
});

test("migração 0162: a tabela das chaves por registro sai; as listas por página, a assinatura e o histórico entram", () => {
  const db = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "..", "drizzle");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  const tabelas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((x) => x.name);
  assert.ok(!tabelas.includes("centi_staging_fora"));
  assert.ok(tabelas.includes("centi_alteracoes"));
  const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((x) => x.name);
  for (const t of ["empenhos", "liquidacoes", "pagamentos"]) assert.ok(cols(t).includes("hash") && cols(t).includes("ausente_desde_lote"), t);
  assert.ok(cols("centi_lote_passos").includes("chaves_iguais"));
});
