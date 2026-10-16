import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { orgaos, reparticoes } from "../src/db/schema.ts";
import {
  comandoApagarVinculos,
  comandoCopiarVinculosParaUnidade,
  comandoMoverVinculos,
  comandosRealinhar,
  consultaContaVinculos,
  consultaVinculosDosAlvos,
  linhaVinculo,
} from "../src/lib/responsaveis-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// Os VÍNCULOS dos responsáveis pelos MESMOS builders do servidor, no driver `drizzle-orm/d1` REAL e DENTRO de `db.batch`
// — como o promover/rebaixar fazem (o órgão/unidade recém-criado é o MAX(id) do lote). Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("responsáveis — vínculos (builders no db.batch do D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const vinculos = () =>
    (
      db.prepare("SELECT responsavel_id AS p, orgao_id AS o, reparticao_id AS r, tipo AS t FROM responsaveis_vinculos ORDER BY id").all() as {
        p: number;
        o: number | null;
        r: number | null;
        t: string;
      }[]
    ).map((x) => ({ ...x }));

  beforeEach(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO orgaos (id, nome, sigla, assinatura_unica) VALUES (500, 'Órgão A', 'OA', 1), (501, 'Órgão B', 'OB', 0);
      INSERT INTO reparticoes (id, codigo, nome, orgao_id) VALUES (510, 'U1', 'Unidade 1', 501), (511, 'U2', 'Unidade 2', 501);
      INSERT INTO responsaveis (id, nome, matricula, chave) VALUES (1, 'Ana', '1', 'ANA'), (2, 'Bia', '2', 'BIA');
      INSERT INTO responsaveis_vinculos (responsavel_id, orgao_id, reparticao_id, tipo, inicio, fim) VALUES
        (1, 500, NULL, 'padrao', NULL, NULL), (2, 500, NULL, 'temporario', '2026-01-01', '2026-02-01'),
        (2, NULL, 510, 'padrao', NULL, NULL);`);
  });

  it("consulta por alvos (ids num parâmetro JSON) e por contagem", async () => {
    const l = (await consultaVinculosDosAlvos(orm, { orgaos: [500], unidades: [510] })).map(linhaVinculo);
    assert.deepEqual(
      l.map((x) => [x.nome, x.orgaoId, x.reparticaoId, x.tipo]),
      [
        ["Ana", 500, null, "padrao"],
        ["Bia", 500, null, "temporario"],
        ["Bia", null, 510, "padrao"],
      ],
    );
    assert.equal((await consultaVinculosDosAlvos(orm, { orgaos: [], unidades: [] })).length, 0);
    assert.equal(Number((await consultaContaVinculos(orm, { orgaoId: 500 }))[0].n), 2);
  });

  it("promover sem vínculo de DFD: os vínculos da unidade passam ao órgão NOVO no mesmo lote (MAX(id))", async () => {
    await orm.batch([
      orm.insert(orgaos).values({ nome: "Novo", sigla: "NV" }).returning({ id: orgaos.id }),
      comandoMoverVinculos(orm, { reparticaoId: 510 }, { orgaoId: sql`(SELECT MAX(id) FROM orgaos)` }),
      orm.delete(reparticoes).where(eq(reparticoes.id, 510)),
    ]);
    const novo = (db.prepare("SELECT MAX(id) AS id FROM orgaos").get() as { id: number }).id;
    assert.deepEqual(vinculos().at(-1), { p: 2, o: novo, r: null, t: "padrao" }, "não se perdeu na exclusão da unidade");
  });

  it("promover preservando: a unidade recebe a CÓPIA dos vínculos do órgão de assinatura única", async () => {
    await orm.batch([comandoCopiarVinculosParaUnidade(orm, 500, 511)]);
    assert.deepEqual(
      vinculos().filter((x) => x.r === 511),
      [
        { p: 1, o: null, r: 511, t: "padrao" },
        { p: 2, o: null, r: 511, t: "temporario" },
      ],
    );
    assert.equal(vinculos().filter((x) => x.o === 500).length, 2, "os do órgão ficam");
  });

  it("rebaixar: os vínculos do órgão substituem os da unidade e o órgão sai sem levar nada em cascata", async () => {
    await orm.batch([
      comandoApagarVinculos(orm, { reparticaoId: 510 }),
      comandoMoverVinculos(orm, { orgaoId: 500 }, { reparticaoId: 510 }),
      orm.delete(orgaos).where(eq(orgaos.id, 500)),
    ]);
    assert.deepEqual(vinculos(), [
      { p: 1, o: null, r: 510, t: "padrao" },
      { p: 2, o: null, r: 510, t: "temporario" },
    ]);
  });

  it("REALINHAR (mover · copiar · apagar) no MESMO lote da mudança", async () => {
    // 3 = Bia em U1 (padrão) → vai ao órgão A; copia para U2; o 1 (Ana no órgão A) sai como repetido.
    await orm.batch([
      orm.update(orgaos).set({ sigla: "OA2" }).where(eq(orgaos.id, 500)),
      ...comandosRealinhar(orm, [
        { tipo: "copiar", id: 3, para: { orgaoId: null, reparticaoId: 511 } },
        { tipo: "mover", id: 3, para: { orgaoId: 500, reparticaoId: null } },
        { tipo: "apagar", id: 1 },
      ]),
    ] as never);
    assert.deepEqual(vinculos(), [
      { p: 2, o: 500, r: null, t: "temporario" },
      { p: 2, o: 500, r: null, t: "padrao" },
      { p: 2, o: null, r: 511, t: "padrao" },
    ]);
  });
});
