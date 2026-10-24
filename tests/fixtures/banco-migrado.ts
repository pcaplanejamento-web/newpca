import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Um banco com o SCHEMA FINAL de toda a cadeia de migrações (`drizzle/*.sql`) — aplicada UMA vez; cada chamada recria só as
 * definições (tabelas, índices, VIEWs e gatilhos), sem os dados semeados. Rápido para testes que precisam de muitos bancos.
 */
let esquema: string[] | null = null;

export function bancoMigrado(): DatabaseSync {
  if (!esquema) {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    esquema = (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, rowid")
        .all() as { sql: string }[]
    ).map((r) => r.sql);
  }
  const novo = new DatabaseSync(":memory:");
  novo.exec("PRAGMA foreign_keys = ON");
  for (const s of esquema) novo.exec(s);
  return novo;
}
