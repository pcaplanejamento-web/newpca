import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  comandosApagarHistorico,
  comandosCatalogosDaPasta,
  comandosCompras,
  comandosContratos,
  comandosExcluirPasta,
  consultaComprasPorCodigos,
  consultaIndicadoresHistorico,
} from "../src/lib/catalogo-historico-sql.ts";
import type { CompraHistoricoImport, ContratoHistoricoImport } from "../src/lib/catalogo-validation.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// HISTÓRICO DE COMPRA e PASTAS do catálogo pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL e DENTRO
// de `db.batch` (a transação do D1). Confere também o limite de 100 parâmetros por comando.
const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

const contrato = (i: number): ContratoHistoricoImport => ({
  idContrato: String(1000 + i),
  numeroContrato: String(i),
  idLicitacao: "1",
  numeroLicitacao: "93",
  orgao: "PREFEITURA",
  unidadeGestora: null,
  credor: `CREDOR ${i}`,
  valorContrato: 100 * i,
  dataAssinatura: "2026-02-23",
  dataPublicacao: null,
  modalidade: "PREGÃO",
  protocolo: "9770/2026",
  objeto: "OBJETO, COM VÍRGULA",
  natureza: null,
  detalhamento: null,
});
const compra = (ordem: number, contratoId: string): CompraHistoricoImport => ({
  ordem,
  idContrato: contratoId,
  processo: "47604",
  codigo: String(500 + (ordem % 7)),
  sequencial: ordem + 1,
  descricao: `ITEM ${ordem}`,
  qtdContratada: 2,
  qtdAditada: 0,
  qtdEmpenhada: null,
  qtdOfEmpenhar: null,
  saldoEmpenhar: null,
  valorUnitario: 10,
  valorContratado: 20,
  valorEmpenhado: null,
  saldoValorEmpenhar: null,
  qtdLiquidada: null,
  qtdLiquidadaAnulada: null,
  qtdEmpenhadaAnulada: null,
  saldoLiquidar: null,
});
const n = (db: DatabaseSync, q: string) => (db.prepare(q).get() as { n: number }).n;

describe("histórico de compra e pastas (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO catalogos (id, nome, tipo) VALUES (1, 'Agenda A', 'agenda'), (2, 'Histórico 2026', 'historico'), (3, 'Agenda B', 'agenda')");
  });

  it("cada INSERT fica abaixo de 100 parâmetros", () => {
    for (const c of comandosContratos(orm, 2, Array.from({ length: 13 }, (_, i) => contrato(i)))) assert.ok(c.toSQL().params.length <= 100);
    for (const c of comandosCompras(orm, 2, Array.from({ length: 9 }, (_, i) => compra(i, "1000")))) assert.ok(c.toSQL().params.length <= 100);
  });

  it("contratos: grava e regravar o mesmo lote não duplica (atualiza)", async () => {
    const lote = Array.from({ length: 13 }, (_, i) => contrato(i));
    await orm.batch(comandosContratos(orm, 2, lote) as never);
    await orm.batch(comandosContratos(orm, 2, lote.map((c) => ({ ...c, credor: `${c.credor} (novo)` }))) as never);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogo_contratos WHERE catalogo_id = 2"), 13);
    assert.equal((db.prepare("SELECT credor FROM catalogo_contratos WHERE id_contrato = '1003'").get() as { credor: string }).credor, "CREDOR 3 (novo)");
  });

  it("itens: lotes idempotentes (repetir não duplica) e o total do catálogo acompanha", async () => {
    const itens = Array.from({ length: 9 }, (_, i) => compra(i, String(1000 + (i % 3))));
    await orm.batch(comandosCompras(orm, 2, itens.slice(0, 5)) as never);
    await orm.batch(comandosCompras(orm, 2, itens.slice(5)) as never);
    await orm.batch(comandosCompras(orm, 2, itens.slice(5)) as never); // a repetição após uma falha
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogo_compras WHERE catalogo_id = 2"), 9);
    assert.equal(n(db, "SELECT total_itens AS n FROM catalogos WHERE id = 2"), 9);
    const [ind] = await consultaIndicadoresHistorico(orm);
    assert.deepEqual({ ...ind }, { catalogoId: 2, valor: 180, contratos: 3, produtos: 7 });
  });

  it("pasta: define os catálogos (entram, saem) e excluir a pasta só a tira", async () => {
    db.exec("INSERT INTO catalogo_pastas (id, nome) VALUES (7, 'Compras'), (8, 'Outra')");
    db.exec("UPDATE catalogos SET pasta_id = 8 WHERE id = 3");
    await orm.batch(comandosCatalogosDaPasta(orm, 7, [1, 2, 3]) as never);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogos WHERE pasta_id = 7"), 3, "o 3 sai da pasta 8");
    await orm.batch(comandosCatalogosDaPasta(orm, 7, [2]) as never);
    assert.deepEqual(
      (db.prepare("SELECT id FROM catalogos WHERE pasta_id = 7").all() as { id: number }[]).map((r) => r.id),
      [2],
    );
    await orm.batch(comandosCatalogosDaPasta(orm, 7, []) as never);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogos WHERE pasta_id = 7"), 0);
    await orm.batch(comandosCatalogosDaPasta(orm, 7, [1, 2]) as never);
    await orm.batch(comandosExcluirPasta(orm, 7) as never);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogo_pastas WHERE id = 7"), 0);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogos"), 3, "os catálogos ficam");
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogos WHERE pasta_id IS NOT NULL"), 0);
  });

  it("compras de alguns códigos em todos os históricos, com o contrato — UMA consulta, um parâmetro", async () => {
    const q = consultaComprasPorCodigos(orm, ["500", "501", "999"]);
    assert.equal(q.toSQL().params.length, 1);
    const linhas = await q;
    assert.equal(linhas.length, n(db, "SELECT COUNT(*) AS n FROM catalogo_compras WHERE codigo IN ('500','501')"));
    assert.ok(linhas.length > 0);
    assert.ok(linhas.every((l) => l.codigo === "500" || l.codigo === "501"));
    assert.ok(linhas.every((l) => l.dataAssinatura === "2026-02-23" && l.credor?.startsWith("CREDOR")));
    assert.deepEqual(await consultaComprasPorCodigos(orm, ["999"]), []);
  });

  it("apagar o histórico tira contratos e itens só daquele catálogo", async () => {
    db.exec("INSERT INTO catalogos (id, nome, tipo) VALUES (4, 'Outro histórico', 'historico')");
    await orm.batch(comandosContratos(orm, 4, [contrato(1)]) as never);
    await orm.batch(comandosApagarHistorico(orm, 2) as never);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogo_compras WHERE catalogo_id = 2"), 0);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogo_contratos WHERE catalogo_id = 2"), 0);
    assert.equal(n(db, "SELECT COUNT(*) AS n FROM catalogo_contratos WHERE catalogo_id = 4"), 1);
  });
});
