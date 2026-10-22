import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
test("worker: as consultas dos canais ao vivo leem o aparelho, o termo e a config (SQLite real)", () => {
  const db = new DatabaseSync(":memory:");
  const dir = "drizzle";
  for (const a of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, a), "utf8"));
  db.exec(`INSERT INTO usuarios (id,email,nome,senha_hash,status) VALUES (1,'a','A','x','ativo')`);
  db.exec(`INSERT INTO aparelhos (id,usuario_id,hash,nome,criado_em) VALUES (7,1,'hh','PC sala','2026')`);
  db.exec(`INSERT INTO sessoes (id,token_hash,usuario_id,expira_em,aparelho_id) VALUES (5,'tk',1,'2099',7)`);
  db.exec(`INSERT OR REPLACE INTO configuracoes (id,dados) VALUES (1,'{"acessoConta":{"modo":"ativo"}}')`);
  const src = readFileSync("worker.ts", "utf8");
  for (const m of src.matchAll(/prepare\(\s*`([\s\S]*?)`/g)) {
    const q = m[1].replace(/\$\{[^}]+\}/g, "");
    const n = (q.match(/\?/g) ?? []).length;
    const params = n === 2 ? ["tk", "2026"] : [1, "pref", 1, "tk", "2026"];
    const r = db.prepare(q).get(...params) as Record<string, unknown>;
    assert.equal(r.aparelho_nome, "PC sala");
    assert.equal(r.admin, 0);
    assert.equal(JSON.parse(r.acesso_conta as string).modo, "ativo");
  }
});
