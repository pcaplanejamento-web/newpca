import type { DatabaseSync } from "node:sqlite";

/**
 * D1 MÍNIMO sobre `node:sqlite` (prepare/bind/run/all/raw/first + `batch` TRANSACIONAL, como o D1) — para
 * testar os builders do Drizzle pelo driver `drizzle-orm/d1` REAL, inclusive dentro de `db.batch`.
 */
type Param = string | number | bigint | null | Uint8Array;

class Comando {
  // Campos explícitos (o type stripping do Node não aceita "parameter properties").
  private readonly db: DatabaseSync;
  readonly sql: string;
  private readonly params: Param[];
  constructor(db: DatabaseSync, sql: string, params: Param[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params: unknown[]) {
    return new Comando(this.db, this.sql, params.map((p) => (typeof p === "boolean" ? Number(p) : (p as Param))));
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params), success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async raw() {
    return this.db.prepare(this.sql).all(...this.params).map((l) => Object.values(l as object));
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }
}

export function d1Sobre(db: DatabaseSync) {
  return {
    prepare: (sql: string) => new Comando(db, sql),
    async batch(comandos: Comando[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const c of comandos) out.push(await c.all());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
  };
}
