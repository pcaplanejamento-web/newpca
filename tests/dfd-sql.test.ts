import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfdProtocolos, dfds } from "../src/db/schema.ts";
import { filtroAnoPcaDfd, prioridadeTextoSql } from "../src/lib/dfd-sql.ts";
import { normPrioridade } from "../src/lib/normalize.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A PRIORIDADE (só a seção, lida no banco) e o filtro do PCA do CABEÇALHO pelos MESMOS builders da lista da Mesa, no driver
// `drizzle-orm/d1` REAL sobre `node:sqlite` (a cadeia de migrações). Requer --experimental-sqlite.

const secoes = (...s: [string, string][]) => JSON.stringify(s.map(([titulo, texto], i) => ({ numero: i + 1, titulo, texto })));

describe("dfd-sql — prioridade da seção e PCA do cabeçalho", () => {
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    db.exec("INSERT INTO dfd_protocolos (id, numero, ano_pca) VALUES (1, 'P-1/2026', 2027), (2, 'P-2/2026', 2026), (3, 'P-3/2026', NULL)");
    const ins = db.prepare("INSERT INTO dfds (id, numero, protocolo_id, ano_pca, secoes) VALUES (?, ?, ?, ?, ?)");
    ins.run(1, "101", 1, 2027, secoes(["3 - JUSTIFICATIVA", "x"], ["6 - PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", "Alta"]));
    ins.run(2, "102", 2, 2026, secoes(["6 - Prioridade", "média — manutenção"]));
    ins.run(3, "103", 3, 2028, secoes(["3 - JUSTIFICATIVA", "sem prioridade"])); // protocolo sem ano → o do DFD
    ins.run(4, "104", null, 2027, null); // sem seções
    ins.run(5, "105", null, null, "{isto não é json"); // JSON inválido não derruba a consulta
    ins.run(6, "106", 1, 2026, secoes(["7 - FUNDAMENTAÇÃO LEGAL", "Lei 14.133"], ["6 - PRIORIDADE", "BAIXA"])); // o do protocolo prevalece
    orm = drizzle(d1Sobre(db) as never, { schema });
  });

  const lista = (ano?: number | null) =>
    orm
      .select({ numero: dfds.numero, prioridadeTexto: prioridadeTextoSql })
      .from(dfds)
      .leftJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
      .where(filtroAnoPcaDfd(ano))
      .orderBy(asc(dfds.numero));

  it("lê SÓ o texto da seção PRIORIDADE (qualquer nº/caixa do título) e tolera seções ausentes/inválidas", async () => {
    const r = await lista();
    assert.deepEqual(
      r.map((x) => [x.numero, normPrioridade(x.prioridadeTexto).valor]),
      [
        ["101", "ALTA"],
        ["102", "MÉDIA"],
        ["103", null],
        ["104", null],
        ["105", null],
        ["106", "BAIXA"],
      ],
    );
  });

  it("PCA do cabeçalho: o ano do PROTOCOLO de origem prevalece; sem protocolo (ou sem ano nele), o do DFD", async () => {
    assert.deepEqual(
      (await lista(2027)).map((x) => x.numero),
      ["101", "104", "106"],
    );
    assert.deepEqual(
      (await lista(2026)).map((x) => x.numero),
      ["102"],
    );
    assert.deepEqual(
      (await lista(2028)).map((x) => x.numero),
      ["103"],
    );
  });

  it("sem PCA escolhido (todos) = sem filtro", async () => {
    assert.equal(filtroAnoPcaDfd(null), undefined);
    assert.equal((await lista(null)).length, 6);
  });
});
