import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  aadLoginCenti,
  abrirLoginCenti,
  abrirSelado,
  cifrarLoginCenti,
  impressaoDaChave,
  MOTIVO_PAUSA,
  mascararUsuario,
  PROPOSITO_LOGIN_CENTI,
  pedidoDaExtensao,
  selarParaChave,
} from "../src/lib/centi-login-core.ts";
import {
  comandoApagarLoginCenti,
  comandoAutoLoginCenti,
  comandoImportarLoginCenti,
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
    assert.equal(l.pausadoEm, null, "salvar sem trocar a senha (retomar) tira a pausa");
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

// A ENTREGA SELADA: a senha só sai cifrada para a chave PÚBLICA de um navegador autorizado — só a privada dele abre.
async function parExtensao() {
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const publica = btoa(String.fromCharCode(...raw));
  return { privada: par.privateKey, publica, impressao: (await impressaoDaChave(publica)) as string };
}

describe("login da Centi — entrega selada", () => {
  it("só a chave do navegador autorizado abre; outra chave ou outra impressão não", async () => {
    const a = await parExtensao();
    const b = await parExtensao();
    assert.match(a.impressao, /^[0-9a-f]{64}$/);
    const selado = await selarParaChave(a.publica, a.impressao, '{"usuario":"maria","senha":"s3gredo"}');
    assert.ok(!JSON.stringify(selado).includes("s3gredo"));
    assert.equal(await abrirSelado(a.privada, a.impressao, selado), '{"usuario":"maria","senha":"s3gredo"}');
    assert.equal(await abrirSelado(b.privada, a.impressao, selado), null, "outro navegador não abre");
    assert.equal(await abrirSelado(a.privada, b.impressao, selado), null, "a impressão faz parte do selo");
    assert.equal(await abrirSelado(a.privada, a.impressao, { ...selado, ct: selado.ct.replace(/^./, (c) => (c === "A" ? "B" : "A")) }), null, "adulterado não abre");
  });

  it("a impressão só de uma chave P-256 crua (65 bytes, 0x04)", async () => {
    assert.equal(await impressaoDaChave("lixo"), null);
    assert.equal(await impressaoDaChave(btoa("x".repeat(65))), null);
  });

  it("a pausa é por código, com o texto fixo do sistema", () => {
    assert.deepEqual(Object.keys(MOTIVO_PAUSA).sort(), ["recusado", "verificacao"]);
  });
});

describe("login da Centi — importação", () => {
  it("a importação só entra com o banco vazio — nunca sobrescreve", async () => {
    const db = bancoMigrado();
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (1, 'a@x', 'A', 'x', 'ativo')`);
    assert.equal((await comandoImportarLoginCenti(orm, 1, "v2:a:b", false, "2026-11-19T10:00:00Z")).length, 1);
    assert.equal((await comandoImportarLoginCenti(orm, 1, "v2:c:d", true, "2026-11-19T11:00:00Z")).length, 0);
    const [l] = await consultaLoginCenti(orm, 1);
    assert.deepEqual([l.cifrado, l.auto], ["v2:a:b", 0]);
  });
});

describe("login da Centi — quem é a extensão", () => {
  const EXT = "chrome-extension://lhdooglmnecpbocibgfobaefahliicnn";
  it("o Origin da extensão vale; o da página do sistema ou de outra extensão, nunca", () => {
    assert.equal(pedidoDaExtensao("POST", EXT, "none", EXT), true);
    assert.equal(pedidoDaExtensao("POST", "https://governarv.com.br", "same-origin", EXT), false);
    assert.equal(pedidoDaExtensao("POST", "chrome-extension://outra", "none", EXT), false);
    assert.equal(pedidoDaExtensao("POST", "null", null, EXT), false);
  });
  it("POST sem Origin vale (página nenhuma manda assim); GET nunca — nem com o Origin ausente", () => {
    assert.equal(pedidoDaExtensao("POST", null, null, EXT), true);
    assert.equal(pedidoDaExtensao("PUT", null, "none", EXT), true);
    assert.equal(pedidoDaExtensao("POST", null, "same-origin", EXT), false, "o Sec-Fetch-Site de uma página recusa");
    assert.equal(pedidoDaExtensao("POST", null, "cross-site", EXT), false);
    assert.equal(pedidoDaExtensao("GET", null, null, EXT), false);
    assert.equal(pedidoDaExtensao("GET", EXT, null, EXT), true);
  });
});
