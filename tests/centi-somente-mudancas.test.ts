import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { alteracoesDoRegistro, camposDaAlteracao, valorDoCampo } from "../src/lib/centi-alteracoes-core.ts";
import { comandoLimparAlteracoes, consultaAlteracoes } from "../src/lib/centi-alteracoes-sql.ts";
import { lerPaginaEmpenhos, type PassoNovo, podePular } from "../src/lib/empenhos-core.ts";
import {
  CONF_EMPENHOS,
  comandoPaginaIgual,
  comandoRecontarLote,
  comandoRegistrarPasso,
  comandosConferirAssinatura,
  comandosPromover,
  consultaAssinaturas,
  consultaPaginaAnterior,
  consultaUltimoPasso,
  contagemDaPromocao,
} from "../src/lib/empenhos-sql.ts";
import { bytesDoPar, hashLinha, hashTupla, MAX_BYTES_PARTE, paresDaParte, partesComIguais } from "../src/lib/importacao-partes-core.ts";
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
async function pagina(b: ReturnType<typeof banco>, lote: number, regs: Record<string, unknown>[], comoPar: (chave: string) => string | null = () => null, legado = false) {
  const linhas = lerPaginaEmpenhos(JSON.stringify(regs), 2026).linhas;
  const pares = linhas.flatMap((l) => {
    const h = comoPar(l.chave);
    return h ? [[l.chave, h] as [string, string]] : [];
  });
  const chavesPar = new Set(pares.map((p) => p[0]));
  const inteiras = linhas.filter((l) => !chavesPar.has(l.chave)).map((l) => ({ ...l, hash: hashLinha("empenhos", l, LEITOR) }));
  const c = comandosConferirAssinatura(b.db, legado ? { ...CONF_EMPENHOS, leitor: LEITOR } : CONF_EMPENHOS, lote, 1, 1, inteiras, pares, []);
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
  // 12 mil iguais: partes SÓ de pares, cada uma com ≤ 80 KB (o orçamento é em BYTES — a CPU de cada requisição é fixa).
  const muitas = Array.from({ length: 12_000 }, (_, i) => ({ chave: `k${i}` }));
  const gm = new Map(muitas.map((l) => [l.chave, hashLinha("empenhos", l, 1)]));
  const pm = partesComIguais("empenhos", muitas, gm, 1);
  assert.equal(pm.reduce((t, x) => t + x.iguais.length, 0), 12_000, "nenhum par se perde");
  assert.ok(pm.every((x) => x.tuplas.length === 0 && x.iguais.length <= 5000));
  // Chaves LONGAS (as dos empenhos: "ano|órgão gestor|nº") e linhas inteiras junto: nenhuma parte passa de 80 KB.
  const longas = Array.from({ length: 20_000 }, (_, i) => ({ chave: `2026|PREFEITURA MUNICIPAL DE RIO VERDE GOIAS|${i}`, numero: String(i), ano: 2026, valorEmpenhado: 1, historico: "X".repeat(i % 7 ? 10 : 400) }));
  const gl = new Map(longas.filter((_, i) => i % 5).map((l) => [l.chave, hashLinha("empenhos", l, 1)]));
  const pl = partesComIguais("empenhos", longas, gl, 1);
  for (const x of pl) assert.ok(JSON.stringify(x.tuplas).length + x.iguais.reduce((t, par) => t + bytesDoPar(par), 0) <= MAX_BYTES_PARTE + 2, "≤ 80 KB por parte");
  assert.equal(pl.reduce((t, x) => t + x.iguais.length + x.tuplas.length, 0), 20_000);
  // O servidor recusa pares acima do teto de bytes.
  const grandes = Array.from({ length: 2000 }, (_, i): [string, string] => [`2026|PREFEITURA MUNICIPAL DE RIO VERDE GOIAS|${i}`, "abc12345"]);
  assert.equal(paresDaParte(grandes, new Set()).ok, false, "mais de 80 KB de pares numa parte");
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
  // 0163: o pulo da página idêntica.
  assert.ok(cols("centi_lote_passos").includes("chaves_gravadas") && cols("centi_lote_passos").includes("assinatura_bruta"));
  assert.ok(cols("centi_leituras").includes("assinatura"));
});

test("D1 real: registro gravado ANTES da assinatura (hash NULL) e igual = 1 escrita (a assinatura), nunca o staging nem a regravação", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await pagina(b, l1, [reg("1"), reg("2"), reg("3")]);
  await promover(b, l1);
  // Como estavam antes da v1.241.0: sem a assinatura.
  b.raw.exec("UPDATE empenhos SET hash = NULL");
  const antes = b.raw.prepare("SELECT numero, atualizado_em, lote_id FROM empenhos ORDER BY numero").all();
  b.raw.exec("DELETE FROM escritas");
  const l2 = b.novoLote();
  assert.deepEqual(await pagina(b, l2, [reg("1"), reg("2", { ValorEmpenhado: 777 }), reg("3")], () => null, true), { novos: 0, alterados: 1, iguais: 2 });
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas WHERE t = 'staging'"), 1, "só o alterado vai ao staging");
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas WHERE t = 'empenhos'"), 2, "os 2 iguais: só a assinatura, uma escrita cada");
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE hash IS NOT NULL AND numero IN ('1', '3')"), 2);
  b.raw.exec("DELETE FROM escritas");
  const c = await promover(b, l2);
  assert.deepEqual({ i: c.inseridos, a: c.atualizados, r: c.removidos, au: c.ausentes }, { i: 0, a: 1, r: 0, au: 0 });
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas WHERE t = 'empenhos'"), 1, "a promoção regrava só o alterado");
  const depois = b.raw.prepare("SELECT numero, atualizado_em, lote_id FROM empenhos WHERE numero <> '2' ORDER BY numero").all();
  assert.deepEqual(depois, (antes as { numero: string }[]).filter((x) => x.numero !== "2"), "os iguais não mudam (data e lote)");
  const id = b.n("SELECT id n FROM empenhos WHERE numero = '2'");
  assert.deepEqual(alteracoesDoRegistro(await consultaAlteracoes(b.db, "empenho", id))[0].campos.map((x) => x.campo), ["valorEmpenhado"], "o histórico só do campo");
  assert.equal(b.n("SELECT COUNT(*) n FROM centi_alteracoes"), 1);
});

test("D1 real: a assinatura no lugar não vale para outro leitor nem para o removido (seguem o caminho normal)", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await pagina(b, l1, [reg("1"), reg("2")]);
  await promover(b, l1);
  b.raw.exec("UPDATE empenhos SET hash = NULL; UPDATE empenhos SET leitor = 0 WHERE numero = '1'; UPDATE empenhos SET removido_em = CURRENT_TIMESTAMP WHERE numero = '2'");
  b.raw.exec("DELETE FROM escritas");
  const l2 = b.novoLote();
  assert.deepEqual(await pagina(b, l2, [reg("1"), reg("2")], () => null, true), { novos: 0, alterados: 2, iguais: 0 });
  assert.equal(b.n("SELECT COUNT(*) n FROM empenhos WHERE hash IS NOT NULL"), 0);
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas WHERE t = 'staging'"), 2);
});

test("D1 real: as assinaturas em PÁGINAS pelo id — nenhuma perdida nem repetida", async () => {
  const b = banco();
  const l1 = b.novoLote();
  await pagina(b, l1, Array.from({ length: 25 }, (_, i) => reg(String(i + 1))));
  await promover(b, l1);
  const todas = new Map<string, string>();
  let depois = 0;
  let paginas = 0;
  for (;;) {
    const [r] = await consultaAssinaturas(b.db, "empenhos", 1, 2026, depois, 10);
    if (r.ultimo == null) break;
    for (const [k, v] of Object.entries(JSON.parse(r.j) as Record<string, string>)) {
      assert.ok(!todas.has(k), "sem repetir");
      todas.set(k, v);
    }
    depois = r.ultimo;
    paginas++;
  }
  assert.equal(paginas, 3);
  assert.equal(todas.size, 25);
});

test("pulo da página idêntica: a régua (assinatura, conclusão, vínculos, chaves válidas, fora nas liquidações)", () => {
  const base = { assinatura: "abc", concluido: true, vinculosDepois: false, fora: 0, invalidos: 0 };
  assert.equal(podePular(base, "abc", "empenhos"), true);
  assert.equal(podePular(null, "abc", "empenhos"), false, "sem volta anterior");
  assert.equal(podePular(base, null, "empenhos"), false, "a resposta não veio inteira");
  assert.equal(podePular(base, "outra", "empenhos"), false, "os bytes mudaram");
  assert.equal(podePular({ ...base, concluido: false }, "abc", "empenhos"), false);
  assert.equal(podePular({ ...base, invalidos: 1 }, "abc", "empenhos"), false, "uma chave não vale mais");
  assert.equal(podePular({ ...base, vinculosDepois: true }, "abc", "empenhos"), false, "os vínculos mudaram");
  assert.equal(podePular({ ...base, fora: 2 }, "abc", "empenhos"), true, "nos empenhos o fora segue fora (os vínculos não mudaram)");
  assert.equal(podePular({ ...base, fora: 2 }, "abc", "liquidacoes"), false, "nas liquidações o destino pode ter chegado");
  assert.equal(podePular(base, "abc", "pagamentos"), true);
});

test("D1 real: a VOLTA SEGUINTE da automática com a Centi idêntica pula a página — nada lido nem gravado, a conclusão igual", async () => {
  const b = banco();
  b.raw.exec("UPDATE empenho_cards SET vinculos_em = '2020-01-01T00:00:00.000Z' WHERE id = 1");
  const regs = [reg("1"), reg("2"), reg("3")];
  const l1 = b.novoLote();
  await pagina(b, l1, regs);
  b.raw.exec(`UPDATE centi_lote_passos SET assinatura_bruta = 'sha-a' WHERE lote_id = ${l1}`);
  const c1 = await promover(b, l1);
  assert.equal(c1.inseridos, 3);
  const lote = (id: number) => ({ id, cardId: 1, ano: 2026, modo: "dados", leitor: 0, orgaosCenti: null });
  const periodo = { inicio: "2026-01-01", fim: "2026-12-31" };
  b.raw.exec("DELETE FROM escritas");
  const antes = b.raw.prepare("SELECT numero, atualizado_em, lote_id FROM empenhos ORDER BY numero").all();
  // 2ª volta: a mesma resposta.
  const l2 = b.novoLote();
  const ant = await consultaPaginaAnterior(b.db, "empenhos", lote(l2), periodo, 1);
  assert.ok(ant && podePular(ant, "sha-a", "empenhos"), "pula");
  await b.db.batch([comandoPaginaIgual(b.db, l2, ant.passo, "{}", false), comandoRecontarLote(b.db, l2)] as never);
  const passo = b.raw.prepare(`SELECT estado, recebidos, res_iguais, chaves_iguais, assinatura_bruta FROM centi_lote_passos WHERE lote_id = ${l2}`).get() as Record<string, unknown>;
  assert.equal(passo.estado, "ok");
  assert.equal(passo.recebidos, 3);
  assert.equal(passo.res_iguais, 3);
  assert.equal((JSON.parse(String(passo.chaves_iguais)) as string[]).length, 3, "as gravadas da volta 1 passam a iguais");
  assert.equal(passo.assinatura_bruta, "sha-a");
  assert.equal(b.n(`SELECT unicos n FROM centi_lotes WHERE id = ${l2}`), 3, "a conferência com a Centi vê as 3");
  const c2 = await promover(b, l2);
  assert.deepEqual({ i: c2.inseridos, a: c2.atualizados, r: c2.removidos, au: c2.ausentes }, { i: 0, a: 0, r: 0, au: 0 });
  assert.equal(b.n("SELECT COUNT(*) n FROM escritas"), 0, "nada escrito no staging nem nos empenhos");
  assert.deepEqual(b.raw.prepare("SELECT numero, atualizado_em, lote_id FROM empenhos ORDER BY numero").all(), antes);
  // 3ª volta: a página copiada da 2ª também pula (as chaves continuam completas).
  const l3 = b.novoLote();
  const ant3 = await consultaPaginaAnterior(b.db, "empenhos", lote(l3), periodo, 1);
  assert.ok(ant3 && ant3.passo !== ant.passo && podePular(ant3, "sha-a", "empenhos"));
  // Um registro removido no banco: a página não pula mais (lê como sempre).
  b.raw.exec("UPDATE empenhos SET removido_em = CURRENT_TIMESTAMP WHERE numero = '2'");
  assert.equal(podePular(await consultaPaginaAnterior(b.db, "empenhos", lote(l3), periodo, 1), "sha-a", "empenhos"), false);
  b.raw.exec("UPDATE empenhos SET removido_em = NULL");
  // Os vínculos mudaram depois da última volta: não pula.
  b.raw.exec("UPDATE empenho_cards SET vinculos_em = '2999-01-01T00:00:00.000Z' WHERE id = 1");
  assert.equal(podePular(await consultaPaginaAnterior(b.db, "empenhos", lote(l3), periodo, 1), "sha-a", "empenhos"), false);
  // Outro leitor, outro modo ou outra página: sem anterior.
  assert.equal(await consultaPaginaAnterior(b.db, "empenhos", { ...lote(l3), leitor: 9 }, periodo, 1), null);
  assert.equal(await consultaPaginaAnterior(b.db, "empenhos", lote(l3), periodo, 2), null);
});
