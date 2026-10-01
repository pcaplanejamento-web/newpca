import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { dfds } from "../src/db/schema.ts";
import { gruposAssinaturaSql } from "../src/lib/dfd-sql.ts";
import { type GrupoAssinatura, gruposAssinatura, gruposDoTexto } from "../src/lib/dfd-tratamento.ts";
import { coerceFonte } from "../src/lib/parse-dfd-comum.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// Os GRUPOS de assinatura calculados NO BANCO (a lista da Mesa não traz mais o JSON das assinaturas) têm de ser
// EXATAMENTE os de antes — `gruposAssinatura(parseAssinaturas(json))` — em todo caso de borda. Driver `drizzle-orm/d1`
// REAL sobre `node:sqlite` (a cadeia de migrações). Requer --experimental-sqlite.

/** A régua de ANTES: o `parseAssinaturas` de `dfd.ts` (não importável aqui — puxa o `getDb`): JSON → só array → só as
 * entradas `typeof object` não nulas → `coerceFonte` → os grupos. */
function referencia(json: string | null): GrupoAssinatura[] {
  if (!json) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return gruposAssinatura(
    arr
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({ fonte: coerceFonte(a.fonte) })),
  );
}

const CASOS: (string | null)[] = [
  null,
  "",
  "{isto não é json",
  '{"fonte":"adobe"}',
  '"dropsigner"',
  "[]",
  '[{"fonte":"certificado"}]',
  '[{"fonte":"sistema"},{"fonte":"dropsigner"}]',
  '[{"fonte":"adobe"},{"fonte":"adobe"}]',
  '[{"fonte":"manual"},{"fonte":"foxit"},{"fonte":"dropsigner"}]',
  "[{}]",
  '[{"fonte":"Dropsigner"}]',
  '[{"fonte":5}]',
  '[{"fonte":null}]',
  '[{"fonte":{"x":1}}]',
  '[null, 1, "x", true, false, 2.5]',
  "[[1,2]]",
  '["dropsigner", "adobe"]',
  '[{"fonte":"adobe"}, "x", null, {"fonte":"manual"}]',
  '[{"nome":"FULANO","fonte":"dropsigner","validacao":{"por":"equipe","responsavel":"X"},"ocr":true}]',
  '[{"fonte":"foxit","ocr":true},{"fonte":"certificado"},{"fonte":"desconhecida"}]',
  "  [ {\"fonte\" : \"adobe\"} ]  ",
];

describe("grupos de assinatura no banco (lista da Mesa)", () => {
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    const ins = db.prepare("INSERT INTO dfds (id, numero, assinaturas) VALUES (?, ?, ?)");
    CASOS.forEach((json, i) => {
      ins.run(i + 1, String(1000 + i), json);
    });
    orm = drizzle(d1Sobre(db) as never, { schema });
  });

  it("os MESMOS grupos de `gruposAssinatura(parseAssinaturas(json))`, na ordem fixa, em todo caso de borda", async () => {
    const r = await orm.select({ numero: dfds.numero, g: gruposAssinaturaSql }).from(dfds).orderBy(asc(dfds.id));
    assert.equal(r.length, CASOS.length);
    r.forEach((linha, i) => {
      assert.deepEqual(gruposDoTexto(linha.g), referencia(CASOS[i]), `caso ${i}: ${CASOS[i]}`);
    });
  });

  it("os casos cobrem todos os grupos (o teste não passa vazio)", async () => {
    const r = await orm.select({ g: gruposAssinaturaSql }).from(dfds);
    const todos = new Set(r.flatMap((l) => gruposDoTexto(l.g)));
    assert.deepEqual([...todos].sort(), ["adobe", "centi", "dropsigner", "foxit", "manual"]);
  });

  it("gruposDoTexto: tolerante e na ordem fixa", () => {
    assert.deepEqual(gruposDoTexto('["manual","centi","adobe"]'), ["centi", "adobe", "manual"]);
    assert.deepEqual(gruposDoTexto('["x", 1, null, "foxit"]'), ["foxit"]);
    assert.deepEqual(gruposDoTexto("não é json"), []);
    assert.deepEqual(gruposDoTexto('{"centi":1}'), []);
    assert.deepEqual(gruposDoTexto(null), []);
  });
});
