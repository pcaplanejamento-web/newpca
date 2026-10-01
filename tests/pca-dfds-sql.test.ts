import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { consultaDfdsEmOutroPca } from "../src/lib/pca-dfds-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// "DFD em OUTRO PCA" (a incorporação e a Mesa do PCA) numa ÚNICA consulta, com os ids num parâmetro JSON — qualquer que
// seja a quantidade (antes, uma consulta a cada 90 ids). Driver `drizzle-orm/d1` REAL sobre `node:sqlite`.

describe("pca-dfds-sql — DFDs em outro PCA numa consulta", () => {
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  let consultas = 0;
  before(() => {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    db.exec("INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2027', 2027, 'protocolo'), (2, 'PCA 2026', 2026, 'protocolo')");
    const dfd = db.prepare("INSERT INTO dfds (id, numero) VALUES (?, ?)");
    const vinc = db.prepare("INSERT INTO pca_dfds (pca_id, dfd_id) VALUES (?, ?)");
    db.exec("BEGIN");
    for (let id = 1; id <= 2500; id++) {
      dfd.run(id, String(id));
      if (id % 3 === 0) vinc.run(2, id); // em OUTRO PCA (o 2)
      if (id % 5 === 0) vinc.run(1, id); // neste PCA (o 1) — não conta
    }
    db.exec("COMMIT");
    const d1 = d1Sobre(db);
    const prepare = d1.prepare;
    const contar = (sql: string) => {
      consultas++;
      return prepare(sql);
    };
    orm = drizzle({ ...d1, prepare: contar } as never, { schema });
  });

  it("2.000 ids em UMA consulta: só os que estão em OUTRO PCA", async () => {
    const ids = Array.from({ length: 2000 }, (_, i) => i + 1);
    consultas = 0;
    const r = await consultaDfdsEmOutroPca(orm, ids, 1);
    assert.equal(consultas, 1);
    const achados = new Set(r.map((x) => x.dfdId));
    const esperado = ids.filter((id) => id % 3 === 0);
    assert.equal(achados.size, esperado.length);
    for (const id of esperado) assert.ok(achados.has(id), `DFD ${id}`);
    assert.ok(r.every((x) => x.pcaId === 2));
  });

  it("o PCA de referência não conta; lista vazia = nenhum", async () => {
    assert.deepEqual(await consultaDfdsEmOutroPca(orm, [5, 10, 20], 1), []);
    assert.deepEqual(
      (await consultaDfdsEmOutroPca(orm, [15, 30], 2)).map((x) => [x.dfdId, x.pcaId]),
      [
        [15, 1],
        [30, 1],
      ],
    );
    assert.deepEqual(await consultaDfdsEmOutroPca(orm, [], 1), []);
  });
});
