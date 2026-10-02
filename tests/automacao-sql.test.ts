import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  comandoAtualizarPasso,
  comandoConsumirAutorizacao,
  comandoCriarAutorizacao,
  comandoLimparAutorizacoes,
  comandoRecontar,
  comandoRegistrarEscrita,
  comandosPassos,
} from "../src/lib/automacao-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A fundação da Automação no driver `drizzle-orm/d1` REAL (dentro de `db.batch`). Requer --experimental-sqlite.
const DIR = join(process.cwd(), "drizzle");

describe("automação: passos, autorização de uso único e registros", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  before(() => {
    db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
    db.exec("PRAGMA foreign_keys = ON");
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec("INSERT INTO usuarios (id, email, nome, senha_hash) VALUES (1, 'a@x', 'A', 'x'), (2, 'b@x', 'B', 'x')");
    db.exec("INSERT INTO automacao_execucoes (id, receita, usuario_id) VALUES (10, 'anexar-dfds', 1)");
  });

  it("50 passos em INSERTs de ≤ 96 parâmetros, na ordem; totais recontados no banco", async () => {
    const passos = Array.from({ length: 50 }, (_, i) => ({ chave: `p${i}`, capacidade: "anexar", alvo: `a${i}` }));
    const cmds = comandosPassos(orm, 10, passos);
    assert.equal(cmds.length, 4);
    for (const c of cmds) assert.ok(c.toSQL().params.length <= 96);
    await orm.batch([cmds[0], ...cmds.slice(1), comandoRecontar(orm, 10)] as never);
    await orm.batch([comandoAtualizarPasso(orm, 10, "p0", { estado: "ok" }), comandoAtualizarPasso(orm, 10, "p1", { estado: "falhou", erro: "x" }), comandoRecontar(orm, 10)] as never);
    const e = db.prepare("SELECT total, feitos, falhas FROM automacao_execucoes WHERE id = 10").get() as Record<string, number>;
    assert.deepEqual({ ...e }, { total: 50, feitos: 1, falhas: 1 });
    const p0 = db.prepare("SELECT ordem, fim IS NOT NULL AS f FROM automacao_passos WHERE chave = 'p49'").get() as Record<string, number>;
    assert.equal(p0.ordem, 49);
  });

  it("a autorização vale UMA vez, só para quem a pediu e dentro da validade", async () => {
    await comandoCriarAutorizacao(orm, { idHash: "h1", execucaoId: 10, passoChave: "p2", capacidade: "anexar", alvoHash: "ah", usuarioId: 1, expiraEm: 100 });
    assert.equal((await comandoConsumirAutorizacao(orm, "h1", 2, 50)).length, 0, "outra pessoa não consome");
    assert.equal((await comandoConsumirAutorizacao(orm, "h1", 1, 150)).length, 0, "vencida não vale");
    const [a] = await comandoConsumirAutorizacao(orm, "h1", 1, 50);
    assert.deepEqual({ ...a }, { execucaoId: 10, passoChave: "p2", capacidade: "anexar", alvoHash: "ah" });
    assert.equal((await comandoConsumirAutorizacao(orm, "h1", 1, 50)).length, 0, "uso único");
    await comandoCriarAutorizacao(orm, { idHash: "h2", execucaoId: 10, passoChave: "p3", capacidade: "anexar", alvoHash: "ah", usuarioId: 1, expiraEm: 10 });
    await comandoLimparAutorizacoes(orm, 20);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM automacao_autorizacoes").get() as { n: number }).n, 0);
  });

  it("a mesma escrita nunca é registrada duas vezes", async () => {
    const r = { capacidade: "anexar", centiAlvo: "2332778", descricao: "PGM", centiDocumento: "5454711", protocoloId: null, execucaoId: 10, usuarioId: 1, usuarioNome: "A" };
    assert.equal((await comandoRegistrarEscrita(orm, r)).length, 1);
    assert.equal((await comandoRegistrarEscrita(orm, r)).length, 0);
  });
});
