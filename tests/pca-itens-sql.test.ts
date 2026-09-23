import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfdProtocolos } from "../src/db/schema.ts";
import { gravarSequencialNosItens, numerarItensDoProtocolo } from "../src/lib/pca-itens-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A NUMERAÇÃO dos itens no PCA pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL (sobre um D1
// mínimo em `node:sqlite`) e DENTRO de `db.batch` — como a incorporação. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("sequencial do item no PCA (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  /** O lote da incorporação (depois do upsert em `pca_dfds`): numera + grava no item + marca o protocolo. */
  const incorporar = (pca: number, protocolo: number) =>
    orm.batch([
      numerarItensDoProtocolo(orm, pca, protocolo),
      gravarSequencialNosItens(orm, pca, protocolo),
      orm
        .update(dfdProtocolos)
        .set({ pcaIncorporadoEm: "2027-01-01" })
        .where(and(eq(dfdProtocolos.id, protocolo), eq(dfdProtocolos.pcaId, pca))),
    ]);
  const numeros = (pca: number) =>
    (db.prepare("SELECT sequencial AS s, dfd_item_id AS i FROM pca_itens WHERE pca_id = ? ORDER BY sequencial").all(pca) as { s: number; i: number }[]).map(
      (r) => ({ ...r }),
    );

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'protocolo'), (2, 'Outro', 2027, 'protocolo');
      INSERT INTO dfd_protocolos (id, numero, pca_id) VALUES (10, 'P-10', 1), (20, 'P-20', 1), (30, 'P-30', 2);
      INSERT INTO dfds (id, numero, protocolo_id) VALUES (100, 'D100', 10), (101, 'D101', 10), (200, 'D200', 20), (201, 'D201', 20), (300, 'D300', 30);
      INSERT INTO dfd_itens (id, dfd_id, sequencial) VALUES (1, 100, 1), (2, 100, 2), (3, 101, 1), (4, 200, 1), (5, 200, 2), (6, 201, 1), (7, 300, 1);
      INSERT INTO pca_dfds (pca_id, dfd_id, acao) VALUES (1, 100, 'incorporar'), (1, 101, 'incorporar'), (1, 200, 'incorporar'), (1, 201, 'excluir'), (2, 300, 'incorporar');`);
  });

  it("numera 1..N na ordem DFD → item e grava o nº no próprio item", async () => {
    await incorporar(1, 10);
    assert.deepEqual(numeros(1), [
      { s: 1, i: 1 },
      { s: 2, i: 2 },
      { s: 3, i: 3 },
    ]);
    assert.deepEqual({ ...(db.prepare("SELECT pca_id AS p, pca_sequencial AS s FROM dfd_itens WHERE id = 3").get() as object) }, { p: 1, s: 3 });
    assert.ok((db.prepare("SELECT pca_incorporado_em AS e FROM dfd_protocolos WHERE id = 10").get() as { e: string | null }).e);
  });

  it("idempotente: repetir o lote não duplica", async () => {
    await incorporar(1, 10);
    assert.equal(numeros(1).length, 3);
  });

  it("o próximo protocolo continua a sequência; DFD com ação 'excluir' não numera", async () => {
    await incorporar(1, 20);
    assert.deepEqual(
      numeros(1).map((n) => n.s),
      [1, 2, 3, 4, 5],
    );
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pca_itens WHERE dfd_item_id = 6").get() as { n: number }).n, 0);
  });

  it("número INATIVO nunca é reaproveitado; cada PCA tem a sua sequência", async () => {
    db.exec("UPDATE pca_itens SET ativo = 0 WHERE pca_id = 1 AND sequencial = 5");
    await incorporar(2, 30);
    assert.deepEqual(numeros(2), [{ s: 1, i: 7 }]);
    db.exec("INSERT INTO dfd_itens (id, dfd_id, sequencial) VALUES (8, 200, 3)");
    await incorporar(1, 20);
    assert.equal(numeros(1).at(-1)?.s, 6, "o nº 5 (inativo) segue ocupado — o novo item ganha o 6");
  });

  it("o par (pca, sequencial) é ÚNICO", () => {
    assert.throws(() => db.exec("INSERT INTO pca_itens (pca_id, sequencial) VALUES (1, 1)"));
  });
});
