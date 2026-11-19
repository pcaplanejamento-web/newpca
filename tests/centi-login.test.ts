import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { abrirLoginCenti, aadLoginCenti, cifrarLoginCenti, mascararUsuario, PROPOSITO_LOGIN_CENTI } from "../src/lib/centi-login-core.ts";
import {
  comandoApagarLoginCenti,
  comandoAutoLoginCenti,
  comandoGuardarLoginCenti,
  comandoPausarLoginCenti,
  comandoRecifrarLoginCenti,
  comandoUsoLoginCenti,
  consultaLoginCenti,
} from "../src/lib/centi-login-sql.ts";
import { chaveDeSegredo, chaveDerivada, cifrar } from "../src/lib/cripto.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// O LOGIN DA CENTI de cada ADM no BANCO: a cifra amarrada ao dono, a leitura do formato antigo e os comandos no D1 real.

describe("login da Centi — cifra", () => {
  it("abre só na linha do mesmo dono; o formato antigo abre e pede regravação", async () => {
    const nova = await chaveDerivada("mestra", PROPOSITO_LOGIN_CENTI);
    const legada = await chaveDeSegredo("mestra");
    const blob = await cifrarLoginCenti(nova, 7, { usuario: "maria", senha: "s3gredo" });
    assert.ok(!blob.includes("s3gredo"));
    assert.deepEqual(await abrirLoginCenti(nova, legada, 7, blob), { usuario: "maria", senha: "s3gredo", legado: false });
    assert.equal(await abrirLoginCenti(nova, legada, 8, blob), null, "copiado para outra pessoa não abre");
    assert.equal(aadLoginCenti(7), "centi-login:u7");
    const antigo = await cifrar(legada, JSON.stringify({ usuario: "joao", senha: "x", auto: false }));
    assert.deepEqual(await abrirLoginCenti(nova, legada, 3, antigo), { usuario: "joao", senha: "x", auto: false, legado: true });
    assert.equal(await abrirLoginCenti(nova, await chaveDeSegredo("outra"), 3, antigo), null);
    assert.equal(await abrirLoginCenti(nova, legada, 3, "lixo"), null);
  });

  it("o usuário à vista só pelo começo", () => {
    assert.equal(mascararUsuario("maria.silva"), "ma•••");
    assert.equal(mascararUsuario("ab"), "a•••");
    assert.equal(mascararUsuario(""), "");
  });
});

describe("login da Centi — banco", () => {
  it("guarda, pausa, retoma ao salvar, troca só o automático, recifra, marca o uso, apaga e sai junto com a pessoa", async () => {
    const db = bancoMigrado();
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (1, 'a@x', 'A', 'x', 'ativo'), (2, 'b@x', 'B', 'x', 'ativo')`);
    await comandoGuardarLoginCenti(orm, 1, "v2:a:b", true, "2026-11-19T10:00:00Z");
    await comandoPausarLoginCenti(orm, 1, "Senha recusada".repeat(40), "2026-11-19T11:00:00Z");
    let [l] = await consultaLoginCenti(orm, 1);
    assert.equal(l.pausadoEm, "2026-11-19T11:00:00Z");
    assert.equal(l.motivo?.length, 300);
    await comandoAutoLoginCenti(orm, 1, false, "2026-11-19T11:30:00Z");
    [l] = await consultaLoginCenti(orm, 1);
    assert.equal(l.auto, 0);
    assert.ok(l.pausadoEm, "trocar só o automático não tira a pausa");
    await comandoGuardarLoginCenti(orm, 1, "v2:c:d", true, "2026-11-19T12:00:00Z");
    [l] = await consultaLoginCenti(orm, 1);
    assert.deepEqual([l.cifrado, l.auto, l.pausadoEm, l.motivo, l.atualizadoEm], ["v2:c:d", 1, null, null, "2026-11-19T12:00:00Z"]);
    await comandoRecifrarLoginCenti(orm, 1, "v2:e:f", false);
    await comandoUsoLoginCenti(orm, 1, "2026-11-19T13:00:00Z");
    [l] = await consultaLoginCenti(orm, 1);
    assert.deepEqual([l.cifrado, l.auto, l.atualizadoEm, l.ultimoUsoEm], ["v2:e:f", 0, "2026-11-19T12:00:00Z", "2026-11-19T13:00:00Z"]);
    await comandoGuardarLoginCenti(orm, 2, "v2:g:h", true, "2026-11-19T12:00:00Z");
    await comandoApagarLoginCenti(orm, 1);
    assert.equal((await consultaLoginCenti(orm, 1)).length, 0);
    db.exec("DELETE FROM usuarios WHERE id = 2");
    assert.equal((await consultaLoginCenti(orm, 2)).length, 0, "a pessoa excluída leva o login");
  });
});
