import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { idsPorGestor, orgaosDaLeitura } from "../src/lib/empenho-cards-core.ts";
import { comandoRegistrarGestores, consultaOrgaosGestores } from "../src/lib/empenho-cards-sql.ts";
import { anoInteiro, erroUnico, lerPaginaEmpenhos, lotePorOrgao, quedaPrimeiraPorOrgao } from "../src/lib/empenhos-core.ts";
import { comandoRecontarLote, comandoRegistrarPasso, comandosFecharLote, comandosGuardarPagina, comandosPromover, contagemDaPromocao, ultimoPromovido, vigentesDosOrgaos } from "../src/lib/empenhos-sql.ts";
import { corpoComOrgao } from "../src/lib/liquidacoes-core.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

test("leitura por órgão: só vale com TODO órgão gestor dos vínculos com o ID conhecido", () => {
  const mapa = [
    { idCenti: 2, orgaoGestor: "PREFEITURA" },
    { idCenti: 3, orgaoGestor: "FUNDO DE SAÚDE" },
    { idCenti: 7, orgaoGestor: "FUNDO DE SAÚDE" },
  ];
  assert.deepEqual(idsPorGestor(mapa).get("FUNDO DE SAÚDE"), [3, 7]);
  assert.deepEqual(orgaosDaLeitura([{ orgaoGestor: "PREFEITURA" }, { orgaoGestor: "FUNDO DE SAÚDE" }, { orgaoGestor: "PREFEITURA" }], mapa), { ids: [2, 3, 7], semId: [], vale: true });
  assert.deepEqual(orgaosDaLeitura([{ orgaoGestor: "PREFEITURA" }, { orgaoGestor: "CÂMARA" }], mapa), { ids: [2], semId: ["CÂMARA"], vale: false }, "um sem ID = o ano inteiro de todos");
  assert.equal(orgaosDaLeitura([], mapa).vale, false, "sem vínculos, nada por órgão");
  assert.equal(lotePorOrgao({ modo: "dados", orgaosCenti: [2] }), true);
  assert.equal(lotePorOrgao({ modo: "dados", orgaosCenti: null }), false);
  assert.equal(lotePorOrgao({ modo: "liquidacoes" }), true);
  assert.deepEqual(corpoComOrgao('{"dataInicio":"{inicio}","dataFim":"{fim}"}', 2026, { inicio: "2026-01-01", fim: "2026-01-07" }, 2), { dataInicio: "01/01/2026", dataFim: "07/01/2026", idOrgao: 2 });
});

function banco() {
  const raw = bancoMigrado();
  raw.exec("INSERT INTO orgaos (id, nome, sigla) VALUES (1, 'Prefeitura', 'PMRV'); INSERT INTO empenho_cards (id, nome, por_orgao) VALUES (1, 'Empenhos', 1)");
  raw.exec("INSERT INTO empenho_card_vinculos (card_id, orgao_gestor, orgao_id) VALUES (1, 'PREFEITURA', 1), (1, 'FUNDO', 1)");
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const novoLote = (orgaos: number[] | null) => Number(raw.prepare("INSERT INTO centi_lotes (card_id, ano, orgaos_centi) VALUES (1, 2026, ?) RETURNING id").get(orgaos ? JSON.stringify(orgaos) : null)?.id);
  return { raw, db, novoLote };
}

/** Uma página (um órgão do período) como a rota grava: o passo com o total do órgão + o staging + a recontagem. */
async function pagina(b: ReturnType<typeof banco>, lote: number, n: number, regs: Record<string, unknown>[], total: number) {
  const p = lerPaginaEmpenhos(JSON.stringify(regs.map((r, i) => (i === 0 ? { ...r, TotalRegistros: total } : r))), 2026);
  const passo = { ...anoInteiro(2026), pagina: n, estado: "ok" as const, fimPeriodo: false, status: 200, bytes: 1, ms: 1, recebidos: p.recebidos, novos: p.linhas.length, recusados: 0, repetidos: 0, total, soma: p.soma, mensagem: null, corpo: "{}" };
  await b.db.batch([comandoRegistrarPasso(b.db, lote, passo), ...comandosGuardarPagina(b.db, lote, n, p.linhas), comandoRecontarLote(b.db, lote)]);
}

test("empenhos por órgão (D1 real): o total soma os órgãos, o mapa é aprendido e o que 'sumiu' é só dos órgãos lidos", async () => {
  const b = banco();
  // A importação do ANO INTEIRO grava a PREFEITURA e o FUNDO.
  const l0 = b.novoLote(null);
  await pagina(b, l0, 1, [{ Numero: "1", OrgaoGestor: "PREFEITURA", ValorEmpenhado: 10 }, { Numero: "2", OrgaoGestor: "FUNDO", ValorEmpenhado: 20 }], 2);
  await b.db.batch(comandosPromover(b.db, l0, 1, 2026, 1, "marcar", await contagemDaPromocao(b.db, l0, 1, 2026, 1)) as never);

  // O mapa: o ID 2 traz a PREFEITURA (o FUNDO ainda sem ID); registrar de novo não duplica.
  await b.db.batch([comandoRegistrarGestores(b.db, 2, ["PREFEITURA"]), comandoRegistrarGestores(b.db, 2, ["PREFEITURA"])]);
  assert.deepEqual((await consultaOrgaosGestores(b.db)).map((x) => ({ ...x })), [{ idCenti: 2, orgaoGestor: "PREFEITURA" }]);

  // Lote POR ÓRGÃO só do ID 2: o empenho 1 mudou; o 2 (FUNDO, não pedido) NÃO pode ser marcado como removido.
  const l1 = b.novoLote([2]);
  await pagina(b, l1, 1, [{ Numero: "1", OrgaoGestor: "PREFEITURA", ValorEmpenhado: 15 }], 1);
  const lote = b.raw.prepare("SELECT total_informado t, unicos u FROM centi_lotes WHERE id = ?").get(l1) as { t: number; u: number };
  assert.deepEqual({ ...lote }, { t: 1, u: 1 }, "o total do lote por órgão = a soma dos órgãos");
  assert.equal(await vigentesDosOrgaos(b.db, 1, 2026, [2]), 1, "só os da PREFEITURA (o ID 2)");
  const c = await contagemDaPromocao(b.db, l1, 1, 2026, 1, [2]);
  assert.deepEqual(c, { inseridos: 0, atualizados: 1, removidos: 0, fora: 0 });
  await b.db.batch(comandosPromover(b.db, l1, 1, 2026, 1, "marcar", c, [2]) as never);
  const e = Object.fromEntries((b.raw.prepare("SELECT numero, valor_empenhado v, removido_em r FROM empenhos").all() as { numero: string; v: number; r: string | null }[]).map((x) => [x.numero, x]));
  assert.equal(e["1"].v, 15);
  assert.equal(e["2"].r, null, "o órgão não lido nunca 'some'");

  // Sem o lote, a leitura do ano inteiro marcaria o 2 — a régua de sempre segue igual.
  const lTodos = b.novoLote(null);
  assert.equal(await contagemDaPromocao(b.db, lTodos, 1, 2026, 1).then((x) => x.removidos), 2);
  b.raw.prepare("UPDATE centi_lotes SET estado = 'parcial' WHERE id = ?").run(lTodos); // um lote LENDO por card

  // A queda compara só com a importação dos MESMOS órgãos.
  assert.equal((await ultimoPromovido(b.db, 1, 2026, -1, [2]))?.unicos, 1);
  assert.equal((await ultimoPromovido(b.db, 1, 2026, -1, null))?.unicos, 2);
  assert.equal(await ultimoPromovido(b.db, 1, 2026, -1, [3]), null);

  // O órgão lido que não trouxe mais o empenho: marcado como removido.
  const l2 = b.novoLote([2]);
  await pagina(b, l2, 1, [], 0);
  const c2 = await contagemDaPromocao(b.db, l2, 1, 2026, 1, [2]);
  assert.equal(c2.removidos, 1);
  await b.db.batch(comandosPromover(b.db, l2, 1, 2026, 1, "marcar", c2, [2]) as never);
  assert.ok((b.raw.prepare("SELECT removido_em r FROM empenhos WHERE numero = '1'").get() as { r: string | null }).r);
  assert.equal((b.raw.prepare("SELECT removido_em r FROM empenhos WHERE numero = '2'").get() as { r: string | null }).r, null);
});

test("a 1ª leitura por órgão pede confirmação quando marcaria removidos demais", () => {
  assert.equal(quedaPrimeiraPorOrgao(100, 5, 90), null);
  assert.equal(quedaPrimeiraPorOrgao(100, 10, 90), null, "exatamente no limite passa");
  assert.match(quedaPrimeiraPorOrgao(100, 11, 90) ?? "", /marcaria 11 de 100/);
  assert.equal(quedaPrimeiraPorOrgao(100, 99, 0), null, "a regra desligada não confere");
  assert.equal(quedaPrimeiraPorOrgao(0, 0, 90), null);
});

test("fechar o lote (D1 real): só o que ainda LÊ — um fechamento atrasado nunca rebaixa o promovido", async () => {
  const b = banco();
  const l = b.novoLote(null);
  b.raw.prepare("UPDATE centi_lotes SET estado = 'promovido' WHERE id = ?").run(l);
  await b.db.batch(comandosFecharLote(b.db, l, "falhou", "atrasado") as never);
  assert.equal((b.raw.prepare("SELECT estado FROM centi_lotes WHERE id = ?").get(l) as { estado: string }).estado, "promovido");
  const l2 = b.novoLote(null);
  await b.db.batch(comandosFecharLote(b.db, l2, "cancelado", "desligada") as never);
  assert.equal((b.raw.prepare("SELECT estado FROM centi_lotes WHERE id = ?").get(l2) as { estado: string }).estado, "cancelado");
});

test("o erro do índice único é reconhecido também embrulhado pelo Drizzle (o texto em `cause`)", () => {
  const d1 = new Error("D1_ERROR: UNIQUE constraint failed: centi_lotes.card_id: SQLITE_CONSTRAINT");
  assert.equal(erroUnico(new Error('Failed query: insert into "centi_lotes"', { cause: d1 })), true);
  assert.equal(erroUnico(d1), true);
  assert.equal(erroUnico(new Error("Failed query", { cause: new Error("no such table") })), false);
});
