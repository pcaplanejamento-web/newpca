import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { grupos } from "../src/db/schema.ts";
import {
  apagaConteudo,
  comandosMembros,
  comandosUnidades,
  idsInexistentes,
  impactoDoGrupo,
  motivoIdsInvalidos,
  textoImpactoGrupo,
} from "../src/lib/rbac-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// A administração de GRUPOS pelos MESMOS builders da rota, no driver `drizzle-orm/d1` REAL (sobre um D1 mínimo em
// `node:sqlite`) e DENTRO de `db.batch` — trocar pessoas/unidades é tudo ou nada. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

const USUARIOS = Array.from({ length: 95 }, (_, i) => 1000 + i);
const UNIDADES = Array.from({ length: 45 }, (_, i) => 500 + i);

describe("grupos: builders no db.batch do D1", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const membros = (g: number) =>
    (db.prepare("SELECT usuario_id AS u FROM usuario_grupos WHERE grupo_id = ? ORDER BY usuario_id").all(g) as { u: number }[]).map((r) => r.u);
  const unidades = (g: number) =>
    (db.prepare("SELECT reparticao_id AS r FROM grupo_reparticoes WHERE grupo_id = ? ORDER BY reparticao_id").all(g) as { r: number }[]).map(
      (r) => r.r,
    );
  // O lote aceita builders de tabelas diferentes (pessoas e unidades); o tipo exato da tupla não importa aqui.
  const lote = (cmds: readonly unknown[]) => orm.batch(cmds as never);

  before(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
    const ins = db.prepare("INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (?, ?, ?, 'x', 'ativo')");
    for (const id of USUARIOS) ins.run(id, `p${id}@rv.go.gov.br`, `Pessoa ${id}`);
    const insU = db.prepare("INSERT INTO reparticoes (id, codigo, nome) VALUES (?, ?, ?)");
    for (const id of UNIDADES) insU.run(id, `U${id}`, `Unidade ${id}`);
    db.exec("INSERT INTO permissoes (id, nome, abas) VALUES (300, 'Consulta', '[\"dfd\"]')");
  });

  beforeEach(() => {
    db.exec("DELETE FROM grupos WHERE id >= 700");
    db.exec("INSERT INTO grupos (id, nome, permissao_id) VALUES (700, 'Compras', 300), (701, 'Outro', NULL)");
    db.exec("INSERT INTO usuario_grupos (usuario_id, grupo_id) VALUES (1000, 700), (1001, 700), (1002, 701)");
    db.exec("INSERT INTO grupo_reparticoes (grupo_id, reparticao_id) VALUES (700, 500), (701, 501)");
  });

  it("troca as pessoas do grupo (mais de 40 = vários INSERTs) sem tocar nos outros grupos", async () => {
    await lote(comandosMembros(orm, 700, USUARIOS));
    assert.deepEqual(membros(700), USUARIOS);
    assert.deepEqual(membros(701), [1002]);
  });

  it("troca as unidades do grupo e aceita esvaziar", async () => {
    await lote(comandosUnidades(orm, 700, UNIDADES));
    assert.deepEqual(unidades(700), UNIDADES);
    await lote(comandosUnidades(orm, 700, []));
    assert.deepEqual(unidades(700), []);
    assert.deepEqual(unidades(701), [501]);
  });

  it("ids repetidos não derrubam o lote", async () => {
    await lote(comandosMembros(orm, 700, [1003, 1003, 1004]));
    assert.deepEqual(membros(700), [1003, 1004]);
  });

  it("TUDO OU NADA: uma pessoa inexistente desfaz o lote inteiro (o grupo não fica vazio)", async () => {
    const cmds = [
      orm.update(grupos).set({ nome: "Compras 2", atualizadoEm: sql`(CURRENT_TIMESTAMP)` }).where(eq(grupos.id, 700)),
      ...comandosMembros(orm, 700, [1005, 999_999]),
      ...comandosUnidades(orm, 700, [502]),
    ];
    await assert.rejects(lote(cmds));
    assert.deepEqual(membros(700), [1000, 1001]);
    assert.deepEqual(unidades(700), [500]);
    assert.equal((db.prepare("SELECT nome FROM grupos WHERE id = 700").get() as { nome: string }).nome, "Compras");
  });

  it("idsInexistentes lista os que faltam, em lotes (mais de 90 ids)", async () => {
    const pedidos = [...USUARIOS, 5, 999_999];
    assert.deepEqual(await idsInexistentes(orm, "usuarios", pedidos), [5, 999_999]);
    assert.deepEqual(await idsInexistentes(orm, "reparticoes", [500, 544, 545]), [545]);
    assert.deepEqual(await idsInexistentes(orm, "permissoes", []), []);
  });

  it("motivoIdsInvalidos: permissão, pessoa e unidade — nulo quando tudo existe", async () => {
    assert.equal(await motivoIdsInvalidos(orm, { permissaoId: 300, membros: [1000], reparticoes: [500] }), null);
    assert.equal(await motivoIdsInvalidos(orm, { permissaoId: null }), null);
    assert.match((await motivoIdsInvalidos(orm, { permissaoId: 301 })) ?? "", /permissão escolhida não existe/);
    assert.match((await motivoIdsInvalidos(orm, { membros: [1000, 42] })) ?? "", /Pessoa\(s\) não encontrada\(s\): 42/);
    assert.match((await motivoIdsInvalidos(orm, { reparticoes: [7777] })) ?? "", /Unidade\(s\) não encontrada\(s\): 7777/);
  });

  it("impacto da exclusão: conta pessoas, unidades e o conteúdo que some em cascata", async () => {
    const vazio = await impactoDoGrupo(orm, 701);
    assert.deepEqual(vazio, { pessoas: 1, unidades: 1, quadros: 0, pastas: 0, modelos: 0 });
    assert.equal(apagaConteudo(vazio), false);
    assert.equal(textoImpactoGrupo(vazio), "1 pessoa perde o acesso dado por este grupo (1 unidade).");

    db.exec(`INSERT INTO tarefa_quadros (id, grupo_id, nome) VALUES (900, 700, 'Q1'), (901, 700, 'Q2');
      INSERT INTO tarefa_pastas (id, grupo_id, nome) VALUES (910, 700, 'P');
      INSERT INTO tarefa_modelos (id, tipo, grupo_id, nome) VALUES (920, 'quadro', 700, 'M');`);
    const cheio = await impactoDoGrupo(orm, 700);
    assert.deepEqual(cheio, { pessoas: 2, unidades: 1, quadros: 2, pastas: 1, modelos: 1 });
    assert.equal(apagaConteudo(cheio), true);
    assert.equal(
      textoImpactoGrupo(cheio),
      "Serão EXCLUÍDOS junto: 2 quadros de tarefas (com as tarefas), 1 pasta, 1 modelo de quadro. 2 pessoas perdem o acesso dado por este grupo (1 unidade).",
    );
    // A cascata que o impacto anuncia é a que o banco faz.
    db.exec("DELETE FROM grupos WHERE id = 700");
    const resta = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE grupo_id = 700`).get() as { n: number }).n;
    for (const t of ["tarefa_quadros", "tarefa_pastas", "tarefa_modelos", "usuario_grupos", "grupo_reparticoes"]) assert.equal(resta(t), 0, t);
  });

  it("texto do impacto sem pessoas nem unidades", () => {
    assert.equal(textoImpactoGrupo({ pessoas: 0, unidades: 0, quadros: 0, pastas: 0, modelos: 0 }), "0 pessoas perdem o acesso dado por este grupo.");
  });
});
