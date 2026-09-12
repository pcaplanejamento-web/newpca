import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";

// Aplica toda a cadeia de migrações (drizzle/*.sql) num SQLite em memória —
// mesmo dialeto do D1 — garantindo que a cadeia evolui sem erro e que o schema
// final tem as tabelas/colunas esperadas. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
const arquivos = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of arquivos) {
    db.exec(readFileSync(join(DIR, arq), "utf8"));
  }
  return db;
}

function nomes(db: DatabaseSync, sql: string): string[] {
  const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
  return rows.map((r) => String(r.name));
}

describe("migrações D1 (drizzle/*.sql)", () => {
  let db: DatabaseSync;
  before(() => {
    db = aplicarTudo();
  });

  it("há a cadeia completa de arquivos", () => {
    assert.ok(arquivos.length >= 8);
  });

  it("cria todas as tabelas do domínio", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of [
      "unidades",
      "itens",
      "usuarios",
      "sessoes",
      "protocolos",
      "protocolo_opcoes",
      "tabelas",
      "colunas",
      "coluna_opcoes",
      "linhas",
      "configuracoes",
    ]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
  });

  it("0007 adiciona matricula e foto em usuarios", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('usuarios')");
    assert.ok(cols.includes("matricula"));
    assert.ok(cols.includes("foto"));
  });

  it("0009/0010 criam RBAC por grupo e repartições", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of [
      "permissoes",
      "grupos",
      "usuario_grupos",
      "reparticoes",
      "grupo_reparticoes",
    ]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const prot = nomes(db, "SELECT name FROM pragma_table_info('protocolos')");
    assert.ok(prot.includes("grupo_id"));
  });

  it("0011 adiciona reparticao_id em unidades", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('unidades')");
    assert.ok(cols.includes("reparticao_id"));
  });

  it("índice único de e-mail existe", () => {
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("usuarios_email_uq"));
  });
});
