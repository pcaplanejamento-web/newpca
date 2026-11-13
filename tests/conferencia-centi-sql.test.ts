import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandosHistoricoCenti, consultaHistoricoCenti, MAX_HISTORICO_CENTI } from "../src/lib/conferencia-centi-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// O HISTÓRICO da conferência × Centi pelos builders, no driver drizzle-orm/d1 REAL e dentro de db.batch.
const DIR = join(process.cwd(), "drizzle");
function banco() {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`INSERT INTO dfds (id, numero) VALUES (1, 'A'), (2, 'B')`);
  return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
}

describe("histórico da conferência com a Centi (builders no db.batch)", () => {
  it("grava, guarda só as 20 mais recentes por DFD e não toca no outro DFD", async () => {
    const { db, orm } = banco();
    const linha = (dfdId: number, n: number) => ({ dfdId, status: n % 2 ? "divergente" : "convergente", motivo: n % 2 ? `m${n}` : null, em: `2026-11-${String(n).padStart(2, "0")}`, porNome: "Ana" });
    await orm.batch(comandosHistoricoCenti(orm as never, [linha(2, 1), linha(2, 2)]) as never);
    for (let n = 1; n <= 25; n++) await orm.batch(comandosHistoricoCenti(orm as never, [linha(1, n)]) as never);
    const h1 = await consultaHistoricoCenti(orm as never, 1);
    assert.equal(h1.length, MAX_HISTORICO_CENTI);
    assert.equal(h1[0].motivo, "m25");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM conferencias_centi WHERE dfd_id = 1").get() as { n: number }).n, MAX_HISTORICO_CENTI);
    assert.equal((await consultaHistoricoCenti(orm as never, 2)).length, 2, "o outro DFD fica intacto");
    // 30 DFDs num lote só (INSERTs de 20 linhas).
    const muitos = Array.from({ length: 30 }, (_, i) => i + 10);
    db.exec(`INSERT INTO dfds (id, numero) VALUES ${muitos.map((i) => `(${i}, 'N${i}')`).join(",")}`);
    await orm.batch(comandosHistoricoCenti(orm as never, muitos.map((d) => linha(d, 1))) as never);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM conferencias_centi WHERE dfd_id >= 10").get() as { n: number }).n, 30);
  });
});
