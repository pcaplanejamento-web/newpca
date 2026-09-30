import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  comandoCadastroPendente,
  comandoCadastroPrimeiro,
  comandoEncerrarSessoesSeInativo,
  comandoExcluirUsuario,
  comandoTrocarPapel,
  comandoTrocarStatus,
  consultaPapelDaChave,
  type DadosCadastro,
} from "../src/lib/papeis-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// PAPÉIS: as travas vivem NO COMANDO (atômico no D1) — pelos mesmos builders das rotas, no driver `drizzle-orm/d1`
// REAL sobre `node:sqlite`. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

const dados = (n: number): DadosCadastro => ({
  nome: `Pessoa ${n}`,
  email: `p${n}@rioverde.go.gov.br`,
  senhaHash: "h",
  matricula: `M${n}`,
  cargo: "Analista",
  reparticaoId: null,
  telefone: n % 2 ? "64999990000" : null,
  telefoneWhatsapp: n % 2 === 1,
});

describe("papéis: comandos no driver D1", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  const idPapel = (chave: string) => (db.prepare("SELECT id FROM papeis WHERE chave = ?").get(chave) as { id: number }).id;
  const linha = (id: number) =>
    ({ ...(db.prepare("SELECT role, status, papel_id AS papel FROM usuarios WHERE id = ?").get(id) as object) }) as {
      role: string;
      status: string;
      papel: number | null;
    };
  const novoUsuario = (id: number, chave: "admin" | "gestor" | "membro", status = "ativo") =>
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, role, status, papel_id) VALUES (${id}, 'u${id}@x', 'U${id}', 'h', '${chave}', '${status}', ${idPapel(chave)})`);

  beforeEach(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
  });

  describe("cadastro", () => {
    it("o 1º cadastro vira Administrador ativo (papel + role espelho)", async () => {
      const [u] = await comandoCadastroPrimeiro(orm, dados(1));
      assert.deepEqual({ role: u.role, status: u.status }, { role: "admin", status: "ativo" });
      assert.deepEqual(linha(u.id), { role: "admin", status: "ativo", papel: idPapel("admin") });
      const r = db
        .prepare("SELECT nome, email, matricula, cargo, email_verificado_em AS v, telefone AS t, telefone_whatsapp AS w, trocar_senha AS s FROM usuarios WHERE id = ?")
        .get(u.id) as Record<string, unknown>;
      assert.deepEqual({ ...r }, { nome: "Pessoa 1", email: "p1@rioverde.go.gov.br", matricula: "M1", cargo: "Analista", v: null, t: "64999990000", w: 1, s: 0 });
    });

    it("dois 'primeiros' cadastros: só um vira Administrador — o outro não é criado", async () => {
      const [a] = await comandoCadastroPrimeiro(orm, dados(1));
      const b = await comandoCadastroPrimeiro(orm, dados(2));
      assert.ok(a);
      assert.deepEqual(b, []);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n, 1);
    });

    it("os demais: papel PADRÃO, pendentes, e-mail confirmado", async () => {
      novoUsuario(10, "admin");
      const [u] = await comandoCadastroPendente(orm, dados(3));
      assert.deepEqual(linha(u.id), { role: "membro", status: "pendente", papel: idPapel("membro") });
      assert.ok((db.prepare("SELECT email_verificado_em AS v FROM usuarios WHERE id = ?").get(u.id) as { v: string | null }).v);
    });

    it("o padrão segue o papel marcado (e o role espelha o papel; nunca o Administrador)", async () => {
      db.exec("UPDATE papeis SET padrao_cadastro = (chave = 'gestor')");
      const [g] = await comandoCadastroPendente(orm, dados(4));
      assert.deepEqual(linha(g.id), { role: "gestor", status: "pendente", papel: idPapel("gestor") });
      db.exec("UPDATE papeis SET padrao_cadastro = (chave = 'admin')");
      const [x] = await comandoCadastroPendente(orm, dados(5));
      assert.deepEqual(linha(x.id), { role: "membro", status: "pendente", papel: null });
      db.exec("INSERT INTO papeis (id, nome, capacidades, padrao_cadastro) VALUES (90, 'Consulta', '{}', 1)");
      db.exec("UPDATE papeis SET padrao_cadastro = (id = 90)");
      const [c] = await comandoCadastroPendente(orm, dados(6));
      assert.deepEqual(linha(c.id), { role: "membro", status: "pendente", papel: 90 });
    });

    it("e-mail repetido é recusado pelo índice único", async () => {
      novoUsuario(10, "admin");
      await comandoCadastroPendente(orm, dados(7));
      await assert.rejects(comandoCadastroPendente(orm, dados(7)));
    });
  });

  describe("trocar papel (último Administrador ativo)", () => {
    it("promove e rebaixa com o role espelho", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "membro");
      assert.equal((await comandoTrocarPapel(orm, 2, idPapel("admin"))).length, 1);
      assert.deepEqual(linha(2), { role: "admin", status: "ativo", papel: idPapel("admin") });
      assert.equal((await comandoTrocarPapel(orm, 2, idPapel("gestor"))).length, 1);
      assert.deepEqual(linha(2), { role: "gestor", status: "ativo", papel: idPapel("gestor") });
    });

    it("papel customizado grava o role 'membro'", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "gestor");
      db.exec("INSERT INTO papeis (id, nome, capacidades) VALUES (90, 'Consulta', '{}')");
      assert.equal((await comandoTrocarPapel(orm, 2, 90)).length, 1);
      assert.deepEqual(linha(2), { role: "membro", status: "ativo", papel: 90 });
    });

    it("o ÚNICO Administrador ativo não é rebaixado", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "admin", "inativo");
      assert.deepEqual(await comandoTrocarPapel(orm, 1, idPapel("gestor")), []);
      assert.equal(linha(1).role, "admin");
    });

    it("dois Administradores se rebaixando: o 2º é recusado (sempre sobra um)", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "admin");
      assert.equal((await comandoTrocarPapel(orm, 1, idPapel("membro"))).length, 1);
      assert.deepEqual(await comandoTrocarPapel(orm, 2, idPapel("membro")), []);
      assert.equal(linha(2).role, "admin");
    });

    it("Administrador sem papel_id (legado) é reconhecido pelo role", async () => {
      novoUsuario(1, "admin");
      db.exec("UPDATE usuarios SET papel_id = NULL WHERE id = 1");
      assert.deepEqual(await comandoTrocarPapel(orm, 1, idPapel("membro")), []);
    });

    it("papel inexistente não troca nada", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "membro");
      assert.deepEqual(await comandoTrocarPapel(orm, 2, 999), []);
      assert.equal(linha(2).papel, idPapel("membro"));
    });
  });

  describe("status, sessões e exclusão", () => {
    const sessoes = (id: number) => (db.prepare("SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ?").get(id) as { n: number }).n;
    const abrirSessao = (id: number) => db.exec(`INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ('t${id}-${Math.random()}', ${id}, '2099-01-01')`);

    it("desativar encerra as sessões no mesmo lote", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "membro");
      abrirSessao(2);
      abrirSessao(2);
      await orm.batch([comandoTrocarStatus(orm, 2, "inativo"), comandoEncerrarSessoesSeInativo(orm, 2)]);
      assert.equal(linha(2).status, "inativo");
      assert.equal(sessoes(2), 0);
    });

    it("o último Administrador ativo não é desativado — e as sessões dele ficam", async () => {
      novoUsuario(1, "admin");
      abrirSessao(1);
      const [r] = await orm.batch([comandoTrocarStatus(orm, 1, "inativo"), comandoEncerrarSessoesSeInativo(orm, 1)]);
      assert.deepEqual(r, []);
      assert.equal(linha(1).status, "ativo");
      assert.equal(sessoes(1), 1);
    });

    it("reativar sempre vale", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "admin", "inativo");
      assert.equal((await comandoTrocarStatus(orm, 2, "ativo")).length, 1);
    });

    it("excluir: o último Administrador ativo nunca; os demais sim", async () => {
      novoUsuario(1, "admin");
      novoUsuario(2, "membro");
      assert.deepEqual(await comandoExcluirUsuario(orm, 1), []);
      assert.equal((await comandoExcluirUsuario(orm, 2)).length, 1);
      novoUsuario(3, "admin");
      assert.equal((await comandoExcluirUsuario(orm, 1)).length, 1);
    });

    it("papel do sistema pela chave", async () => {
      const [g] = await consultaPapelDaChave(orm, "gestor");
      assert.equal(g.id, idPapel("gestor"));
    });
  });
});
