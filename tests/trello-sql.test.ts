import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { comandoConcluir, comandoEnfileirar, comandoReivindicar, comandoSoltarQuadro, comandosVinculo, comandoTravarQuadro } from "../src/lib/trello-sql.ts";
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

  it("vínculo: grava e atualiza pelo (tipo, id daqui); o id do Trello de OUTRO item não muda nada e nunca lança", async () => {
    const { db, orm } = banco();
    const grava = (q: number, tipo: string, l: number, t: string, r: string | null) => orm.batch(comandosVinculo(orm, q, tipo, l, t, r) as never);
    await grava(1, "tarefa", 5, "c5", '{"v":1}');
    await grava(1, "tarefa", 5, "c5", '{"v":2}');
    await grava(1, "lista", 5, "l5", null);
    const linhas = () => db.prepare("SELECT tipo, local_id AS l, trello_id AS t, retrato AS r FROM trello_vinculos ORDER BY tipo, local_id").all() as { tipo: string; l: number; t: string; r: string | null }[];
    assert.deepEqual(linhas().map((x) => [x.tipo, x.t, x.r]), [["lista", "l5", null], ["tarefa", "c5", '{"v":2}']]);
    // Outro item daqui com o MESMO id do Trello: nada muda (antes: UNIQUE constraint failed).
    await grava(1, "tarefa", 6, "c5", null);
    assert.deepEqual(linhas().map((x) => [x.tipo, x.l, x.t]), [["lista", 5, "l5"], ["tarefa", 5, "c5"]]);
    // O próprio item trocando para um id já usado por outro: também nada muda; para um id livre, muda.
    await grava(1, "tarefa", 7, "c7", null);
    await grava(1, "tarefa", 7, "c5", null);
    assert.equal(linhas().find((x) => x.l === 7 && x.tipo === "tarefa")?.t, "c7");
    await grava(1, "tarefa", 7, "c8", '{"v":3}');
    assert.equal(linhas().find((x) => x.l === 7 && x.tipo === "tarefa")?.t, "c8");
  });

  it("trava do quadro: uma passada por vez; a segunda espera, vale de novo depois de soltar ou vencer", async () => {
    const { db, orm } = banco();
    assert.equal((await comandoTravarQuadro(orm, 1)).length, 1);
    assert.equal((await comandoTravarQuadro(orm, 1)).length, 0);
    assert.equal((await comandoTravarQuadro(orm, 2)).length, 1); // outro quadro, livre
    await comandoSoltarQuadro(orm, 1);
    assert.equal((await comandoTravarQuadro(orm, 1)).length, 1);
    db.exec("UPDATE trello_quadros SET processando_ate = datetime('now', '-1 seconds') WHERE quadro_id = 1");
    assert.equal((await comandoTravarQuadro(orm, 1)).length, 1); // vencida
  });
});
