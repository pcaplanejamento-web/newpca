import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  chaveMatricula,
  emailInstitucional,
  filtrarMatricula,
  filtrarNome,
  matriculaValida,
  nomeValido,
  parteLocalEmail,
  problemaSenha,
  temControle,
  usuarioEmailValido,
  violouMatriculaUnica,
} from "../src/lib/cadastro-core.ts";
import { cadastroSchema, cargoSchema, solicitarCodigoSchema } from "../src/lib/auth-validation.ts";
import {
  lerTokenDesafio,
  procurarSolucao,
  sha256Ascii,
  solucaoValida,
  tokenDesafio,
} from "../src/lib/desafio-core.ts";
import { chaveLimite, esperaLimite, LIMITES_ACESSO, mensagemLimite } from "../src/lib/limite-acesso-core.ts";
import {
  comandoConsumirDesafio,
  comandoContarTentativa,
  comandoCriarDesafio,
  comandoLimparDesafios,
  comandoLimparTentativas,
  comandoZerarTentativas,
  consultaTentativas,
} from "../src/lib/limite-acesso-sql.ts";
import { origemPermitida } from "../src/lib/origem.ts";
import { comandoCadastroPendente } from "../src/lib/papeis-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// SEGURANÇA DO ACESSO: as regras dos campos, o limite de tentativas, a verificação anti-robô própria, a origem das
// requisições e a MATRÍCULA ÚNICA no banco (gatilhos da 0071) — os builders pelo driver D1 REAL sobre `node:sqlite`.

describe("campos do cadastro: só dados permitidos", () => {
  it("nome: letras (com acento), espaço, apóstrofo e hífen; nome e sobrenome", () => {
    assert.ok(nomeValido("Maria D'Ávila Souza-Lima"));
    assert.ok(!nomeValido("Maria"));
    assert.ok(!nomeValido("Maria 123"));
    assert.ok(!nomeValido("<script> alert"));
    assert.equal(filtrarNome("  João1 <b>Silva</b>"), "João bSilvab");
    assert.equal(filtrarNome("Ana   Maria"), "Ana Maria");
  });
  it("matrícula: só dígitos (até 15), não só zeros; a chave ignora os zeros à esquerda", () => {
    assert.ok(matriculaValida("012345"));
    assert.ok(!matriculaValida("12-34"));
    assert.ok(!matriculaValida("0000"));
    assert.ok(!matriculaValida("1234567890123456"));
    assert.equal(filtrarMatricula("12.345-6 a"), "123456");
    assert.equal(chaveMatricula(" 000123 "), "123");
  });
  it("e-mail institucional: usuário no padrão (letras, números, . _ -), sem '..' e o domínio certo", () => {
    assert.ok(emailInstitucional("joao.silva@rioverde.go.gov.br"));
    assert.ok(!emailInstitucional("joao..silva@rioverde.go.gov.br"));
    assert.ok(!emailInstitucional(".joao@rioverde.go.gov.br"));
    assert.ok(!emailInstitucional("jo ao@rioverde.go.gov.br"));
    assert.ok(!emailInstitucional("joao@rioverde.go.gov.br.com"));
    assert.ok(!emailInstitucional("joão@rioverde.go.gov.br"));
    assert.ok(!usuarioEmailValido("a+b"));
    assert.equal(parteLocalEmail("João+Silva <x>@gmail.com"), "joaosilvax");
  });
  it("senha nova: 8 a 128, letras e números, sem controle", () => {
    assert.equal(problemaSenha("abc12345"), null);
    assert.match(problemaSenha("abc1") ?? "", /8 caracteres/);
    assert.match(problemaSenha("abcdefgh") ?? "", /letras e números/);
    assert.match(problemaSenha("12345678") ?? "", /letras e números/);
    assert.match(problemaSenha(`a1${"x".repeat(200)}`) ?? "", /no máximo/);
    assert.match(problemaSenha("abc1234\u0000") ?? "", /não permitidos/);
  });
  it("caracteres de controle/invisíveis são detectados", () => {
    assert.ok(temControle("a​b"));
    assert.ok(temControle("a\nb"));
    assert.ok(!temControle("Analista – Nível II"));
  });
  it("schemas: recusam o que não é permitido", () => {
    const base = { nome: "Ana Souza", matricula: "123", reparticaoId: 1, email: "ana.souza@rioverde.go.gov.br", senha: "abc12345" };
    assert.ok(cadastroSchema.safeParse(base).success);
    assert.ok(!cadastroSchema.safeParse({ ...base, matricula: "M-12" }).success);
    assert.ok(!cadastroSchema.safeParse({ ...base, nome: "Ana Souza 2" }).success);
    assert.ok(!cadastroSchema.safeParse({ ...base, senha: "abcdefgh" }).success);
    assert.ok(!cadastroSchema.safeParse({ ...base, cargo: "Analista‮" }).success);
    assert.ok(!solicitarCodigoSchema.safeParse({ email: "a@b.com", finalidade: "cadastro", matricula: "x1" }).success);
    assert.ok(cargoSchema.safeParse({ nome: "Analista (Nível II)" }).success);
    assert.ok(!cargoSchema.safeParse({ nome: "<img src=x>" }).success);
  });
});

describe("limite de tentativas (núcleo)", () => {
  it("bloqueia só depois do máximo e libera no fim da janela", () => {
    const r = LIMITES_ACESSO.loginEmail;
    assert.equal(esperaLimite(r.max, 1000, 1000, r), 0);
    assert.equal(esperaLimite(r.max + 1, 1000, 1100, r), r.janelaS - 100);
    assert.equal(esperaLimite(r.max + 1, 1000, 1000 + r.janelaS + 5, r), 0);
    assert.equal(chaveLimite("loginEmail", " Ana@X "), "loginEmail:ana@x");
    assert.match(mensagemLimite(61), /2 min/);
  });
});

describe("verificação anti-robô própria (prova de trabalho)", () => {
  it("o SHA-256 puro bate com o do Node (inclusive nos limites de bloco)", () => {
    for (const s of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "x".repeat(130)]) {
      const hex = Array.from(sha256Ascii(s), (x) => x.toString(16).padStart(8, "0")).join("");
      assert.equal(hex, createHash("sha256").update(s).digest("hex"));
    }
  });
  it("resolve, confere e recusa solução/token errados", () => {
    const d = "0123456789abcdef0123456789abcdef";
    let n: number | null = null;
    for (let de = 0; n === null; de += 5000) n = procurarSolucao(d, de, 5000, 10);
    assert.ok(solucaoValida(d, n, 10));
    assert.ok(!solucaoValida(d, n + 1, 30));
    assert.deepEqual(lerTokenDesafio(tokenDesafio(d, n)), { desafio: d, n });
    assert.equal(lerTokenDesafio("pow1.xyz.1"), null);
    assert.equal(lerTokenDesafio(`pow1.${d}.-1`), null);
    assert.equal(lerTokenDesafio("token-do-turnstile"), null);
  });
});

describe("origem das requisições (CSRF)", () => {
  const req = (origin?: string) => new Request("https://governarv.com.br/api/x", { method: "POST", headers: origin ? { origin } : {} });
  it("aceita o próprio site e chamadas sem Origin; recusa outro site e 'null'", () => {
    assert.ok(origemPermitida(req("https://governarv.com.br")));
    assert.ok(origemPermitida(req()));
    assert.ok(!origemPermitida(req("https://atacante.com")));
    assert.ok(!origemPermitida(req("null")));
  });
});

const DIR = join(process.cwd(), "drizzle");
function aplicarTudo(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  return db;
}

describe("banco: limite, desafio e matrícula única (driver D1)", () => {
  let db: DatabaseSync;
  let orm: ReturnType<typeof drizzle<typeof schema>>;
  beforeEach(() => {
    db = aplicarTudo();
    orm = drizzle(d1Sobre(db) as never, { schema });
  });

  it("conta atomicamente, recomeça na janela vencida, consulta, zera e limpa", async () => {
    const c = (agora: number, corte: number) => comandoContarTentativa(orm, "k", agora, corte);
    assert.deepEqual(await c(100, 0), [{ contagem: 1, inicio: 100 }]);
    assert.deepEqual(await c(110, 0), [{ contagem: 2, inicio: 100 }]);
    // janela vencida (início 100 ≤ corte 100): recomeça
    assert.deepEqual(await c(1000, 100), [{ contagem: 1, inicio: 1000 }]);
    assert.deepEqual(await consultaTentativas(orm, "k", 900), [{ contagem: 1, inicio: 1000 }]);
    assert.deepEqual(await consultaTentativas(orm, "k", 1000), []);
    await comandoZerarTentativas(orm, "k");
    assert.deepEqual(await consultaTentativas(orm, "k", 0), []);
    await c(50, 0);
    await comandoLimparTentativas(orm, 60);
    assert.deepEqual(await consultaTentativas(orm, "k", 0), []);
  });

  it("o desafio vale UMA vez e só dentro da validade", async () => {
    await comandoCriarDesafio(orm, "d1", 200);
    await comandoCriarDesafio(orm, "d2", 50);
    assert.equal((await comandoConsumirDesafio(orm, "d2", 100)).length, 0); // vencido
    assert.equal((await comandoConsumirDesafio(orm, "d1", 100)).length, 1);
    assert.equal((await comandoConsumirDesafio(orm, "d1", 100)).length, 0); // já usado
    await comandoLimparDesafios(orm, 100);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM desafios_acesso").get() as { n: number }).n, 0);
  });

  it("matrícula repetida é recusada pelo banco (sem os zeros à esquerda), no cadastro e na troca", async () => {
    const dados = (n: number, matricula: string) => ({ nome: `P ${n}`, email: `p${n}@rioverde.go.gov.br`, senhaHash: "h", matricula, cargo: null, reparticaoId: null });
    await comandoCadastroPendente(orm, dados(1, "123"));
    await assert.rejects(() => comandoCadastroPendente(orm, dados(2, "000123")), (e) => violouMatriculaUnica(e));
    await comandoCadastroPendente(orm, dados(3, "456"));
    assert.throws(() => db.exec("UPDATE usuarios SET matricula = '0456' WHERE email = 'p1@rioverde.go.gov.br'"), /matricula_duplicada/);
    // manter a própria (ou mexer em outro campo) segue valendo
    db.exec("UPDATE usuarios SET matricula = '123', nome = 'X Y' WHERE email = 'p1@rioverde.go.gov.br'");
    // sem matrícula não conflita
    db.exec("INSERT INTO usuarios (email, nome, senha_hash, matricula) VALUES ('a@x', 'A', 'h', NULL), ('b@x', 'B', 'h', NULL)");
  });

  it("repetidas ANTIGAS ficam como estão (e seguem editáveis nos demais campos)", () => {
    db.exec("DROP TRIGGER usuarios_matricula_unica_ins");
    db.exec("INSERT INTO usuarios (email, nome, senha_hash, matricula) VALUES ('a@x', 'A', 'h', '9'), ('b@x', 'B', 'h', '9')");
    db.exec(readFileSync(join(DIR, "0071_seguranca_acesso.sql"), "utf8").split("--> statement-breakpoint")[3]);
    db.exec("UPDATE usuarios SET nome = 'A2', matricula = '9' WHERE email = 'a@x'");
  });
});
