import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandoConcluir, comandoEnfileirar, comandoReivindicar, comandoVinculo } from "../src/lib/trello-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A FILA e os VÍNCULOS do Trello pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL.
function banco() {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(process.cwd(), "drizzle", arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("INSERT INTO grupos (id, nome) VALUES (9700, 'G')");
  db.exec("INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (1, 9700, 'Q'), (2, 9700, 'Q2')");
  db.exec("INSERT INTO trello_quadros (quadro_id, board_id) VALUES (1, 'b1'), (2, 'b2')");
  return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
}

describe("trello — fila e vínculos (builders no D1)", () => {
  it("enfileirar junta repetições; reivindicar pega UM devido por vez (do quadro pedido) e o adia; concluir só sem novidade", async () => {
    const { db, orm } = banco();
    await comandoEnfileirar(orm, 1, "saida", "tarefa", "10");
    await comandoEnfileirar(orm, 1, "saida", "tarefa", "10");
    await comandoEnfileirar(orm, 2, "entrada", "tarefa", "c9");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM trello_fila").get() as { n: number }).n, 2);
    const [a] = await comandoReivindicar(orm, 1);
    assert.equal(a.alvo, "10");
    assert.equal(a.tentativas, 1);
    assert.equal((await comandoReivindicar(orm, 1)).length, 0); // adiado 2 min: ninguém pega de novo
    // Uma alteração NOVA chega durante o processamento: concluir não apaga.
    await comandoEnfileirar(orm, 1, "saida", "tarefa", "10");
    await comandoConcluir(orm, a.id, a.criadoEm);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM trello_fila WHERE alvo = '10'").get() as { n: number }).n, 1);
    const [b] = await comandoReivindicar(orm, 1);
    assert.equal(b.tentativas, 1);
    await comandoConcluir(orm, b.id, b.criadoEm);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM trello_fila WHERE alvo = '10'").get() as { n: number }).n, 0);
    const [c] = await comandoReivindicar(orm);
    assert.equal(c.alvo, "c9");
  });

  it("reivindicar trata o board, as listas, as etiquetas e os campos ANTES dos cartões (o cartão não espera a lista)", async () => {
    const { orm } = banco();
    await comandoEnfileirar(orm, 1, "entrada", "tarefa", "c1");
    await comandoEnfileirar(orm, 1, "entrada", "tarefa", "c2");
    await comandoEnfileirar(orm, 1, "entrada", "etiqueta", "e1");
    await comandoEnfileirar(orm, 1, "entrada", "lista", "l1");
    await comandoEnfileirar(orm, 1, "saida", "quadro", "1");
    const ordem: string[] = [];
    for (;;) {
      const [x] = await comandoReivindicar(orm, 1);
      if (!x) break;
      ordem.push(`${x.tipo}:${x.alvo}`);
    }
    assert.deepEqual(ordem, ["quadro:1", "lista:l1", "etiqueta:e1", "tarefa:c1", "tarefa:c2"]);
  });

  it("vínculo: grava e atualiza pelo (tipo, id daqui); o id do Trello é único por tipo", async () => {
    const { db, orm } = banco();
    await comandoVinculo(orm, 1, "tarefa", 5, "c5", '{"v":1}');
    await comandoVinculo(orm, 1, "tarefa", 5, "c5", '{"v":2}');
    await comandoVinculo(orm, 1, "lista", 5, "l5", null);
    const r = db.prepare("SELECT tipo, trello_id AS t, retrato AS r FROM trello_vinculos ORDER BY tipo").all() as { tipo: string; t: string; r: string | null }[];
    assert.deepEqual(r.map((x) => [x.tipo, x.t, x.r]), [["lista", "l5", null], ["tarefa", "c5", '{"v":2}']]);
    await assert.rejects(comandoVinculo(orm, 1, "tarefa", 6, "c5", null));
  });
});
