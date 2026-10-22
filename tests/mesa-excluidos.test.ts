import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfdItens, dfdProtocolos, dfds } from "../src/db/schema.ts";
import { comandoLimparExcluidos, comandoRetratoDfds, comandoRetratoItens, comandoRetratoProtocolo } from "../src/lib/mesa-excluidos-sql.ts";
import { lerRetratoDfd } from "../src/lib/mesa-excluidos-core.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A LIXEIRA DA MESA pelos MESMOS builders do servidor, no driver D1 real e DENTRO do lote da exclusão.
const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
const ator = { id: null, nome: "Ana Teste" };

describe("lixeira da Mesa (retrato no mesmo lote da exclusão)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const linhas = () =>
    (db.prepare("SELECT tipo, alvo_id AS alvo, numero, protocolo_numero AS pn, motivo, valor, retrato, excluido_nome AS por FROM mesa_excluidos ORDER BY id").all() as Record<string, unknown>[]).map((r) => ({ ...r }));

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO dfd_protocolos (id, numero, assunto) VALUES (11, '100/2026', 'INCLUSÃO')");
    db.exec("INSERT INTO dfds (id, numero, planejamento, protocolo_id, total_itens, valor_total) VALUES (1, '501', '601', 11, 2, 30), (2, '502', '602', 11, 1, 5), (3, '503', NULL, NULL, 1, 7)");
    db.exec("INSERT INTO dfd_itens (id, dfd_id, item, codigo, descricao, quantidade, valor_unitario, valor_total, sequencial) VALUES (1, 1, 1, '10', 'CANETA', 2, 5, 10, 1), (2, 1, 2, '11', 'LÁPIS', 4, 5, 20, 2), (3, 2, 1, '12', 'PAPEL', 1, 5, 5, 1), (4, 3, 1, '13', 'CLIPE', 1, 7, 7, 1)");
  });

  it("item removido: o retrato do item com o DFD de origem; o DELETE no mesmo lote", async () => {
    await orm.batch([comandoRetratoItens(orm, 1, [2], "massa", ator), orm.delete(dfdItens).where(eq(dfdItens.id, 2))]);
    const [l] = linhas();
    assert.equal(l.tipo, "item");
    assert.equal(l.numero, "2");
    assert.equal(l.pn, "100/2026");
    assert.equal(l.por, "Ana Teste");
    assert.equal(JSON.parse(l.retrato as string).item.descricao, "LÁPIS");
  });

  it("protocolo excluído: a capa + UM retrato por DFD (cascata) com os itens", async () => {
    await orm.batch([
      comandoRetratoProtocolo(orm, 11, "exclusao", ator),
      comandoRetratoDfds(orm, { protocoloId: 11 }, "cascata", ator),
      orm.delete(dfds).where(eq(dfds.protocoloId, 11)),
      orm.delete(dfdProtocolos).where(eq(dfdProtocolos.id, 11)),
    ]);
    const ls = linhas().slice(1);
    assert.deepEqual(ls.map((l) => [l.tipo, l.numero, l.motivo]), [["protocolo", "100/2026", "exclusao"], ["dfd", "501", "cascata"], ["dfd", "502", "cascata"]]);
    assert.equal(ls[0].valor, 35);
    const d = lerRetratoDfd(ls[1].retrato as string);
    assert.equal(d?.planejamento, "601");
    assert.deepEqual(d?.itens.map((i) => i.descricao), ["CANETA"]);
  });

  it("DFD avulso excluído; nada a excluir = nada gravado; retenção limpa", async () => {
    await orm.batch([comandoRetratoDfds(orm, { dfdId: 3 }, "exclusao", ator), orm.delete(dfds).where(eq(dfds.id, 3))]);
    await orm.batch([comandoRetratoDfds(orm, { dfdId: 999 }, "exclusao", ator)]);
    assert.equal(linhas().length, 5);
    assert.equal(lerRetratoDfd(linhas()[4].retrato as string)?.itens[0].descricao, "CLIPE");
    await orm.batch([comandoLimparExcluidos(orm, "9999-01-01 00:00:00")]);
    assert.equal(linhas().length, 0);
  });
});
