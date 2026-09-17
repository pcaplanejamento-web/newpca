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

  it("0015 concede a aba 'dfd' a quem já tinha 'pca'", () => {
    const row = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as {
      abas: string;
    };
    assert.ok(String(row.abas).includes("dfd"), `abas sem dfd: ${row.abas}`);
  });

  it("0016 cria dfd_protocolos e vincula dfds.protocolo_id", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("dfd_protocolos"), "tabela dfd_protocolos ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfd_protocolos')");
    for (const c of ["numero", "interessado", "documento", "assunto", "valor_capa", "reparticao_id"]) {
      assert.ok(cols.includes(c), `coluna ausente em dfd_protocolos: ${c}`);
    }
    const dfd = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    assert.ok(dfd.includes("protocolo_id"), "coluna dfds.protocolo_id ausente");
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("protocolos_dfd_numero_uq"), "índice único de numero ausente");
    assert.ok(idx.includes("dfds_protocolo_idx"), "índice dfds_protocolo_idx ausente");
  });

  it("0017 adiciona numero_interessado e responsavel_dfd em reparticoes", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    assert.ok(cols.includes("numero_interessado"), "coluna numero_interessado ausente");
    assert.ok(cols.includes("responsavel_dfd"), "coluna responsavel_dfd ausente");
  });

  it("0018 adiciona assinaturas em dfds", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('dfds')");
    assert.ok(cols.includes("assinaturas"), "coluna assinaturas ausente");
  });

  it("0020 adiciona ativo em pcas", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('pcas')");
    assert.ok(cols.includes("ativo"), "coluna pcas.ativo ausente");
  });

  it("0022 cria orgaos, adiciona orgao_id/setor_requisitante e PRESERVA o legado", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("orgaos"), "tabela orgaos ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('reparticoes')");
    // Colunas novas + as antigas continuam presentes (nada perdido no ALTER aditivo).
    for (const c of ["orgao_id", "setor_requisitante", "numero_interessado", "responsavel_dfd", "codigo", "nome", "ordem"]) {
      assert.ok(cols.includes(c), `coluna ausente em reparticoes: ${c}`);
    }
    // Órgão padrão semeado.
    const org = db.prepare("SELECT nome FROM orgaos WHERE id = 1").get() as { nome: string } | undefined;
    assert.ok(org?.nome?.includes("Rio Verde"), "órgão padrão (Prefeitura) ausente");
    // Legado ADAPTADO: unidades pré-existentes (não-GERAL) vinculadas ao órgão 1…
    const amae = db.prepare("SELECT orgao_id FROM reparticoes WHERE codigo = 'AMAE'").get() as { orgao_id: number | null } | undefined;
    assert.equal(amae?.orgao_id, 1, "AMAE deveria estar no órgão 1 (Prefeitura)");
    // …e a GERAL virtual permanece SEM órgão (representa todas as unidades).
    const geral = db.prepare("SELECT orgao_id FROM reparticoes WHERE codigo = 'GERAL'").get() as { orgao_id: number | null } | undefined;
    assert.equal(geral?.orgao_id, null, "GERAL não deve ter órgão");
  });

  it("0023 adiciona assinatura_unica e responsavel_dfd em orgaos (padrão = por unidade)", () => {
    const cols = nomes(db, "SELECT name FROM pragma_table_info('orgaos')");
    assert.ok(cols.includes("assinatura_unica"), "coluna assinatura_unica ausente");
    assert.ok(cols.includes("responsavel_dfd"), "coluna responsavel_dfd ausente em orgaos");
    // Default preserva o comportamento atual: cada unidade tem a sua assinatura (0).
    const org = db.prepare("SELECT assinatura_unica FROM orgaos WHERE id = 1").get() as { assinatura_unica: number } | undefined;
    assert.equal(org?.assinatura_unica, 0, "assinatura_unica deveria começar 0 (por unidade)");
  });

  it("0024 cria catalogo/catalogo_itens (código único global + cascade)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    for (const t of ["catalogos", "catalogo_itens"]) {
      assert.ok(tabelas.includes(t), `tabela ausente: ${t}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("catalogo_itens_codigo_uq"), "índice único de código ausente");
    // A aba 'catalogo' foi concedida a quem já tinha 'dfd'.
    const perm = db.prepare("SELECT abas FROM permissoes WHERE id = 1").get() as { abas: string };
    assert.ok(String(perm.abas).includes("catalogo"), `abas sem catalogo: ${perm.abas}`);
    // Com FK ligada: unicidade GLOBAL do código + cascade ao excluir o catálogo.
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO catalogos (id, nome) VALUES (901, 'Cat A'), (902, 'Cat B')");
    db.exec("INSERT INTO catalogo_itens (catalogo_id, codigo, descricao) VALUES (901, '5241924358', 'AGUA MINERAL')");
    assert.throws(
      () => db.exec("INSERT INTO catalogo_itens (catalogo_id, codigo, descricao) VALUES (902, '5241924358', 'AGUA 2')"),
      "o mesmo código em outro catálogo deveria violar a unicidade global",
    );
    db.exec("DELETE FROM catalogos WHERE id = 901");
    const restantes = db.prepare("SELECT COUNT(*) AS n FROM catalogo_itens WHERE catalogo_id = 901").get() as { n: number };
    assert.equal(restantes.n, 0, "excluir o catálogo deveria apagar os itens (cascade)");
  });

  it("0026 cria auditoria (append-only; FK usuario ON DELETE set null preserva o snapshot)", () => {
    const tabelas = nomes(db, "SELECT name FROM sqlite_master WHERE type='table'");
    assert.ok(tabelas.includes("auditoria"), "tabela auditoria ausente");
    const cols = nomes(db, "SELECT name FROM pragma_table_info('auditoria')");
    for (const c of ["usuario_id", "usuario_nome", "usuario_email", "acao", "entidade", "entidade_id", "resumo", "antes", "depois", "criado_em"]) {
      assert.ok(cols.includes(c), `coluna ausente em auditoria: ${c}`);
    }
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("auditoria_entidade_idx"), "índice de entidade ausente");
    // FK usuario_id ON DELETE set null: excluir o usuário mantém a linha (snapshot preservado).
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (955, 'Fulano', 'f955@x.com', 'h')");
    db.exec("INSERT INTO auditoria (usuario_id, usuario_nome, acao, entidade) VALUES (955, 'Fulano', 'editar', 'dfd')");
    db.exec("DELETE FROM usuarios WHERE id = 955");
    const row = db.prepare("SELECT usuario_id, usuario_nome FROM auditoria WHERE usuario_nome = 'Fulano'").get() as {
      usuario_id: number | null;
      usuario_nome: string;
    };
    assert.equal(row.usuario_id, null, "usuario_id deveria virar null ao excluir o usuário");
    assert.equal(row.usuario_nome, "Fulano", "o snapshot do nome deve permanecer");
  });

  it("índice único de e-mail existe", () => {
    const idx = nomes(db, "SELECT name FROM sqlite_master WHERE type='index'");
    assert.ok(idx.includes("usuarios_email_uq"));
  });
});
