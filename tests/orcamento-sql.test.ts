import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandosSubstituirLancamentos } from "../src/lib/orcamento-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// REENVIO do CUBO pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL e DENTRO de `db.batch`.
const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("substituição dos lançamentos do orçamento (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO orcamentos (id, nome, ano, total_itens, valor_inicial) VALUES (1, 'Orç 2026', 2026, 2, 300), (2, 'Orç 2026 (reenvio)', 2026, 3, 600), (3, 'Outro', 2025, 1, 50)");
    db.exec(`INSERT INTO orcamento_itens (orcamento_id, orgao, valor_inicial, sequencial) VALUES
      (1, 'ANTIGO', 100, 0), (1, 'ANTIGO', 200, 1),
      (2, 'NOVO', 100, 0), (2, 'NOVO', 200, 1), (2, 'NOVO', 300, 2),
      (3, 'OUTRO', 50, 0)`);
  });

  it("troca os lançamentos do alvo pelos da origem, recalcula os totais e apaga a origem", async () => {
    await orm.batch(comandosSubstituirLancamentos(orm, 1, 2));
    const alvo = db.prepare("SELECT nome, ano, total_itens AS n, valor_inicial AS v FROM orcamentos WHERE id = 1").get() as { nome: string; ano: number; n: number; v: number };
    assert.deepEqual({ ...alvo }, { nome: "Orç 2026", ano: 2026, n: 3, v: 600 }); // mantém nome/ano
    const orgaos = db.prepare("SELECT DISTINCT orgao FROM orcamento_itens WHERE orcamento_id = 1").all() as { orgao: string }[];
    assert.deepEqual(orgaos.map((o) => o.orgao), ["NOVO"]);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM orcamentos WHERE id = 2").get() as { n: number }).n, 0, "a origem sai");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM orcamento_itens WHERE orcamento_id = 3").get() as { n: number }).n, 1, "outro orçamento intacto");
  });
});
