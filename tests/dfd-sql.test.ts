import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfdProtocolos, dfds } from "../src/db/schema.ts";
import { filtroAnoPcaDfd, filtroAnoPcaProtocolo, prioridadeTextoSql } from "../src/lib/dfd-sql.ts";
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
    db.exec(
      "INSERT INTO dfd_protocolos (id, numero, ano_pca) VALUES (1, 'P-1/2026', 2027), (2, 'P-2/2026', 2026), (3, 'P-3/2026', NULL), (4, 'P-4/2026', NULL)",
    );
    const ins = db.prepare("INSERT INTO dfds (id, numero, protocolo_id, ano_pca, secoes) VALUES (?, ?, ?, ?, ?)");
    ins.run(1, "101", 1, 2027, secoes(["3 - JUSTIFICATIVA", "x"], ["6 - PRIORIDADE DA COMPRA OU DA CONTRATAÇÃO", "Alta"]));
    ins.run(2, "102", 2, 2026, secoes(["6 - Prioridade", "média — manutenção"]));
    ins.run(3, "103", 3, 2028, secoes(["3 - JUSTIFICATIVA", "sem prioridade"])); // protocolo sem ano → o do DFD
    ins.run(4, "104", null, 2027, null); // sem seções
    ins.run(5, "105", null, null, "{isto não é json"); // JSON inválido não derruba a consulta
    ins.run(6, "106", 1, 2026, secoes(["7 - FUNDAMENTAÇÃO LEGAL", "Lei 14.133"], ["6 - PRIORIDADE", "BAIXA"])); // o do protocolo prevalece
    // JSON VÁLIDO mas fora do formato (elementos texto, objeto na raiz, texto na raiz): o `json_extract` num elemento texto
    // ("malformed JSON") derrubaria a lista inteira — só os elementos objeto são lidos.
    ins.run(7, "107", null, null, '["abc"]');
    ins.run(8, "108", null, null, '{"a":"b"}');
    ins.run(9, "109", null, null, '"abc"');
    ins.run(10, "110", null, null, '["x", {"titulo":"6 - PRIORIDADE","texto":"Baixa"}]'); // misto: o objeto vale
    ins.run(11, "111", 4, null, '[{"titulo":"PRIORIDADE","texto":3}]'); // número ⇒ sai como TEXTO
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
        ["107", null],
        ["108", null],
        ["109", null],
        ["110", "BAIXA"],
        ["111", null],
      ],
    );
    assert.equal(r.find((x) => x.numero === "111")?.prioridadeTexto, "3");
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
    assert.equal(filtroAnoPcaProtocolo(null), undefined);
    assert.equal((await lista(null)).length, 11);
  });

  // A MESMA forma da lista da Mesa (`consultaProtocolos`: junta os DFDs para os totais ao vivo e agrupa).
  const protocolos = (ano?: number | null) =>
    orm
      .select({ numero: dfdProtocolos.numero, dfds: sql<number>`COUNT(DISTINCT ${dfds.id})` })
      .from(dfdProtocolos)
      .leftJoin(dfds, eq(dfds.protocoloId, dfdProtocolos.id))
      .where(filtroAnoPcaProtocolo(ano))
      .groupBy(dfdProtocolos.id)
      .orderBy(asc(dfdProtocolos.numero));

  it("protocolos: o ano do protocolo; o ANTIGO sem ano entra pelo ano de um DFD dele (a régua dos DFDs)", async () => {
    // P-1 (2027) traz os 2 DFDs dele nos totais — o do DFD 106 (2026) não tira o protocolo do 2027.
    assert.deepEqual(await protocolos(2027), [{ numero: "P-1/2026", dfds: 2 }]);
    assert.deepEqual(await protocolos(2026), [{ numero: "P-2/2026", dfds: 1 }]);
    // P-3 não tem ano e o DFD 103 é do 2028 → aparece no 2028 (como o DFD 103 na lista de DFDs).
    assert.deepEqual(await protocolos(2028), [{ numero: "P-3/2026", dfds: 1 }]);
    // P-4 sem ano e sem DFD com ano → só em "todos os PCAs".
    assert.deepEqual(await protocolos(2029), []);
    assert.equal((await protocolos(null)).length, 4);
  });

  it("protocolo × DFD: todo DFD que aparece num PCA tem o protocolo de origem na lista do MESMO PCA", async () => {
    for (const ano of [2026, 2027, 2028]) {
      const numeros = new Set((await protocolos(ano)).map((p) => p.numero));
      const origem = await orm
        .select({ numero: dfdProtocolos.numero })
        .from(dfds)
        .innerJoin(dfdProtocolos, eq(dfds.protocoloId, dfdProtocolos.id))
        .where(filtroAnoPcaDfd(ano));
      for (const o of origem) assert.ok(numeros.has(o.numero), `${o.numero} no PCA ${ano}`);
    }
  });
});
