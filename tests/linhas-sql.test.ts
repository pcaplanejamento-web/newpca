import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { consultaMeusDfds, consultaMeusProtocolos } from "../src/lib/linhas-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// "SÓ OS MEUS" pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL (sobre `node:sqlite`, com a cadeia de
// migrações). Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");

describe("só os meus — protocolos e DFDs (builders no driver D1)", () => {
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    const db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
    db.exec(`INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (1, 'Eu', 'eu@x', 'h'), (2, 'Outra', 'o@x', 'h')`);
    // 10: sou o Responsável; 11: protocolei; 12: de outra pessoa; 13: outra protocolou e eu sou o responsável.
    db.exec(`INSERT INTO dfd_protocolos (id, numero, responsavel_id, criado_por) VALUES
      (10, 'P10', 1, 2), (11, 'P11', NULL, 1), (12, 'P12', 2, 2), (13, 'P13', 1, NULL)`);
    // DFDs: 100 (P10), 101 (P11), 102 (P12), 103 avulso meu, 104 avulso de outra, 105 avulso sem criador.
    db.exec(`INSERT INTO dfds (id, numero, protocolo_id, criado_por) VALUES
      (100, 'D100', 10, 2), (101, 'D101', 11, 2), (102, 'D102', 12, 1), (103, 'D103', NULL, 1), (104, 'D104', NULL, 2), (105, 'D105', NULL, NULL)`);
    orm = drizzle(d1Sobre(db) as never, { schema });
  });

  it("protocolo meu = sou o Responsável OU protocolei", async () => {
    const ids = (await consultaMeusProtocolos(orm, 1)).map((r) => r.id).sort((a, b) => a - b);
    assert.deepEqual(ids, [10, 11, 13]);
    assert.deepEqual((await consultaMeusProtocolos(orm, 2)).map((r) => r.id).sort((a, b) => a - b), [10, 12]);
  });

  it("DFD meu = do protocolo meu, ou avulso criado por mim (criar DFD de um protocolo alheio não o torna meu)", async () => {
    const ids = (await consultaMeusDfds(orm, 1)).map((r) => r.id).sort((a, b) => a - b);
    assert.deepEqual(ids, [100, 101, 103]);
    assert.deepEqual((await consultaMeusDfds(orm, 2)).map((r) => r.id).sort((a, b) => a - b), [100, 102, 104]);
  });
});
