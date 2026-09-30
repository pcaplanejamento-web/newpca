import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { consultaPrimeiroRegistro, criadoPorImportacaoDe } from "../src/lib/auditoria-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// O DESFAZER da importação (orçamento e catálogo) pelo 1º registro do histórico, no driver `drizzle-orm/d1` REAL: só o
// cadastro que a própria pessoa CRIOU por importação na última hora — o reenvio/atualização de um que já existia, nunca.
// Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");

describe("desfazer da importação: o 1º registro do histórico", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const criado = async (entidade: string, id: number, usuario: number) =>
    criadoPorImportacaoDe((await consultaPrimeiroRegistro(orm, entidade, id))[0], usuario);

  before(() => {
    db = new DatabaseSync(":memory:");
    for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
    orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (1, 'a@x', 'A', 'x', 'ativo'), (2, 'b@x', 'B', 'x', 'ativo');
      -- 10: criado AGORA pela pessoa 1 (a importação que falhou) → desfaz
      INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id) VALUES (1, 'importar', 'orcamento', 10);
      -- 20: criado há 2 dias pela pessoa 2; a pessoa 1 REENVIOU a planilha agora → não desfaz
      INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, criado_em) VALUES (2, 'importar', 'orcamento', 20, datetime('now', '-2 days'));
      INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id) VALUES (1, 'importar', 'orcamento', 20);
      -- 30: criado há 2 horas pela própria pessoa 1 → não desfaz (fora da janela)
      INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, criado_em) VALUES (1, 'importar', 'orcamento', 30, datetime('now', '-2 hours'));
      -- 40: catálogo criado À MÃO agora pela pessoa 1 (não é importação) → não desfaz
      INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id) VALUES (1, 'criar', 'catalogo', 40);
      -- 50: catálogo importado agora pela pessoa 2 → só a pessoa 2 desfaz
      INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id) VALUES (2, 'importar', 'catalogo', 50);`);
  });

  it("só o cadastro que a pessoa criou por importação agora há pouco", async () => {
    assert.equal(await criado("orcamento", 10, 1), true);
    assert.equal(await criado("orcamento", 10, 2), false);
  });

  it("o reenvio de planilha de um cadastro antigo (de outra pessoa) não vira desfazer", async () => {
    assert.equal(await criado("orcamento", 20, 1), false);
    assert.equal(await criado("orcamento", 20, 2), false); // a criação foi há 2 dias
  });

  it("fora da janela de 60 min, a criação à mão e o de outra pessoa: não", async () => {
    assert.equal(await criado("orcamento", 30, 1), false);
    assert.equal(await criado("catalogo", 40, 1), false);
    assert.equal(await criado("catalogo", 50, 1), false);
    assert.equal(await criado("catalogo", 50, 2), true);
  });

  it("sem histórico (ou outra entidade com o mesmo id): não", async () => {
    assert.equal(await criado("orcamento", 999, 1), false);
    assert.equal(await criado("catalogo", 10, 1), false);
  });
});
