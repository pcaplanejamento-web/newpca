import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { limparRastroDestino, retratoRastro, type TagSql } from "../src/lib/rastro-sql.ts";

// O SQL do RASTRO (o MESMO texto que o servidor roda pelo `sql` do Drizzle) aplicado sobre a cadeia de
// migrações num SQLite em memória — o dialeto do D1. Requer --experimental-sqlite.

type Cmd = { texto: string; params: (string | number | null)[] };
const q: TagSql<Cmd> = (partes, ...valores) => ({ texto: partes.join("?"), params: valores as Cmd["params"] });

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("rastro do DFD sobrescrito entre protocolos (SQL)", () => {
  let db: DatabaseSync;
  const run = (c: Cmd) => db.prepare(c.texto).run(...c.params);
  /** O que o `start-dfd` faz no lote: retrato (antes) + limpa o destino + move o DFD para o destino. */
  const mover = (numero: string, destino: number, valor: number) => {
    run(retratoRastro(q, numero, destino, null));
    run(limparRastroDestino(q, numero, destino));
    db.prepare("UPDATE dfds SET protocolo_id = ?, valor_total = ? WHERE numero = ?").run(destino, valor, numero);
  };
  const rastro = () =>
    (
      db.prepare("SELECT protocolo_id AS p, dfd_numero AS n, sigla, valor_total AS v FROM dfd_passagens ORDER BY protocolo_id").all() as {
        p: number;
        n: string;
        sigla: string | null;
        v: number;
      }[]
    ).map((r) => ({ ...r })); // objetos comuns (o node:sqlite devolve sem protótipo)

  before(() => {
    db = aplicarTudo();
    db.exec("INSERT INTO reparticoes (id, codigo, nome) VALUES (901, 'SMS', 'Secretaria Municipal de Saúde')");
    for (const [id, n] of [
      [11, "A/2026"],
      [12, "B/2026"],
      [13, "C/2026"],
    ] as const)
      db.prepare("INSERT INTO dfd_protocolos (id, numero) VALUES (?, ?)").run(id, n);
    db.exec("INSERT INTO dfds (numero, protocolo_id, reparticao_id, total_itens, valor_total) VALUES ('1525', 11, 901, 2, 100)");
  });

  it("A → B: o de origem (A) guarda o retrato da versão que tinha (sigla e valor DA ÉPOCA)", () => {
    mover("1525", 12, 200);
    assert.deepEqual(rastro(), [{ p: 11, n: "1525", sigla: "SMS", v: 100 }]);
  });

  it("B → C: B também guarda o dele; A continua (os dois apontam o DFD vivo, hoje em C)", () => {
    mover("1525", 13, 300);
    assert.deepEqual(
      rastro().map((r) => [r.p, r.v]),
      [
        [11, 100],
        [12, 200],
      ],
    );
  });

  it("C → A: o DFD volta a estar vivo em A (sai o rastro de A) e C ganha o dele", () => {
    mover("1525", 11, 400);
    assert.deepEqual(
      rastro().map((r) => [r.p, r.v]),
      [
        [12, 200],
        [13, 300],
      ],
    );
  });

  it("reimportar no MESMO protocolo, DFD sem protocolo ou inexistente: nada muda", () => {
    const antes = rastro();
    mover("1525", 11, 500); // já está em A
    run(retratoRastro(q, "9999", 12, null)); // não existe
    db.exec("INSERT INTO dfds (numero, valor_total) VALUES ('777', 10)"); // avulso, sem protocolo
    run(retratoRastro(q, "777", 12, null));
    assert.deepEqual(rastro(), antes);
  });

  it("repetir o lote (nova tentativa) não duplica — a última passagem vale (upsert por protocolo + nº)", () => {
    db.prepare("UPDATE dfds SET protocolo_id = 12, valor_total = 250 WHERE numero = '1525'").run();
    run(retratoRastro(q, "1525", 13, null));
    run(retratoRastro(q, "1525", 13, null));
    const b = rastro().filter((r) => r.p === 12);
    assert.equal(b.length, 1);
    assert.equal(b[0].v, 250);
  });

  it("excluir o protocolo apaga o rastro dele (cascade)", () => {
    db.exec("DELETE FROM dfds WHERE protocolo_id = 13");
    db.exec("DELETE FROM dfd_protocolos WHERE id = 13");
    assert.ok(rastro().every((r) => r.p !== 13));
  });
});
