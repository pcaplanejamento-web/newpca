import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { consultaEntradasCatalogo } from "../src/lib/catalogo-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// As entradas do catálogo pelo MESMO builder do servidor, no driver `drizzle-orm/d1` REAL sobre `node:sqlite` (a cadeia
// de migrações). Os códigos vão num só parâmetro JSON — milhares numa consulta. Requer --experimental-sqlite.

describe("consultaEntradasCatalogo (json_each, 1 consulta)", () => {
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    db.exec("INSERT INTO catalogos (id, nome) VALUES (1, 'MATERIAL DE CONSUMO')");
    const ins = db.prepare("INSERT INTO catalogo_itens (catalogo_id, codigo, codigo_raw, descricao, unidade, tipos, sequencial) VALUES (1, ?, ?, ?, 'UN', '[\"DFD-S\"]', ?)");
    for (let i = 0; i < 300; i++) ins.run(String(5241900000 + i), String(5241900000 + i), `ITEM ${i}`, i + 1);
    orm = drizzle(d1Sobre(db) as never, { schema });
  });

  it("devolve só os códigos pedidos que existem (com o nome do catálogo)", async () => {
    const r = await consultaEntradasCatalogo(orm, ["5241900001", "0000000000", "5241900299"]);
    assert.deepEqual(r.map((x) => [x.codigo, x.descricao, x.catalogoNome]).sort(), [
      ["5241900001", "ITEM 1", "MATERIAL DE CONSUMO"],
      ["5241900299", "ITEM 299", "MATERIAL DE CONSUMO"],
    ]);
  });

  it("mais de 100 códigos numa consulta só (acima do teto de parâmetros do D1)", async () => {
    const codigos = Array.from({ length: 250 }, (_, i) => String(5241900000 + i));
    assert.equal((await consultaEntradasCatalogo(orm, codigos)).length, 250);
  });

  it("lista vazia não devolve nada", async () => {
    assert.deepEqual(await consultaEntradasCatalogo(orm, []), []);
  });
});
