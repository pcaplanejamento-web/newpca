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

  it("0012 cria tabelas DFD/PCA", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["dfds", "dfd_itens", "pcas", "pca_dfds"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("dfds_numero_uq"), "índice dfds_numero_uq ausente");
  });

  it("0013 adiciona campos completos do DFD", () => {
    const dfd = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    for (const c of ["matricula", "email", "telefone", "valor_total", "secoes"]) {
      assert.ok(dfd.includes(c), `coluna ausente em dfds: ${c}`);
    }
    const item = nomes(db, "SELECT name FROM pragma_table_info('dfd_itens')");
    for (const c of ["valor_unitario", "valor_total"]) {
      assert.ok(item.includes(c), `coluna ausente em dfd_itens: ${c}`);
    }
  });

  it("0014 semeia as repartições da Prefeitura de Rio Verde", () => {
    const cods = nomes(db, "SELECT codigo AS name FROM reparticoes");
    for (const c of ["GP", "CGM", "AMT", "AMAE", "SME", "SMS", "SETIA"]) {
      assert.ok(cods.includes(c), `repartição ausente: ${c}`);
    }
    // idempotência: nenhum código duplicado após aplicar a cadeia.
    const dup = db
      .prepare("SELECT codigo, COUNT(*) n FROM reparticoes GROUP BY codigo HAVING n > 1")
      .all() as Array<Record<string, unknown>>;
    assert.equal(dup.length, 0, `códigos duplicados: ${dup.map((d) => d.codigo).join(", ")}`);
  });

  it("índice único de e-mail existe", () => {
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("usuarios_email_uq"));
  });
});
