import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { gravarSinonimosSeIgual } from "../src/lib/padronizacao-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// Os SINÔNIMOS em lote pelo MESMO builder do servidor, no driver `drizzle-orm/d1` REAL (sobre um D1 mínimo em
// `node:sqlite`) e DENTRO de `db.batch` — compare-and-set: só grava a lista que ainda é a lida. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  return db;
}

describe("sinônimos em lote (compare-and-set no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const sinonimos = (id: number) => JSON.parse((db.prepare("SELECT sinonimos FROM unidades_medida WHERE id = ?").get(id) as { sinonimos: string }).sinonimos);

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO unidades_medida (id, sigla, nome) VALUES (1, 'UN', 'UNIDADE'), (2, 'CX', 'CAIXA');
      UPDATE unidades_medida SET sinonimos = '["UND"]' WHERE id = 1;`);
  });

  it("grava quando a lista no banco é a lida (inclusive a padrão '[]') e devolve o id", async () => {
    const r = await orm.batch([gravarSinonimosSeIgual(orm, 1, ["UND"], ["UND", "UNID"]), gravarSinonimosSeIgual(orm, 2, [], ["CXS"])]);
    assert.deepEqual(
      r.map((x) => x.map((y) => y.id)),
      [[1], [2]],
    );
    assert.deepEqual(sinonimos(1), ["UND", "UNID"]);
    assert.deepEqual(sinonimos(2), ["CXS"]);
  });

  it("NÃO grava se a lista mudou depois da leitura (a gravação concorrente fica) — returning vazio", async () => {
    db.exec(`UPDATE unidades_medida SET sinonimos = '["UND","UNID","U"]' WHERE id = 1`); // outra pessoa gravou no meio
    const r = await orm.batch([gravarSinonimosSeIgual(orm, 1, ["UND", "UNID"], ["UND", "UNID", "UNIDADES"]), gravarSinonimosSeIgual(orm, 2, ["CXS"], ["CXS", "CAIXAS"])]);
    assert.deepEqual(
      r.map((x) => x.map((y) => y.id)),
      [[], [2]],
    );
    assert.deepEqual(sinonimos(1), ["UND", "UNID", "U"], "a lista concorrente não foi sobrescrita");
    assert.deepEqual(sinonimos(2), ["CXS", "CAIXAS"]);
  });
});
