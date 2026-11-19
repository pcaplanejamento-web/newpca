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
  instanteSessao,
  JANELA_AUTORIZACAO_MS,
  MOTIVO_PAUSA,
  mascararUsuario,
  PROPOSITO_LOGIN_CENTI,
  podeAutorizarSemSenha,
  selarParaChave,
} from "../src/lib/centi-login-core.ts";
import {
  comandoApagarLoginCenti,
  comandoAutoLoginCenti,
  comandoImportarLoginCenti,
  comandosAutorizarChave,
  comandoTirarChave,
  consultaAutorizouNaSessao,
  consultaChaveLogin,
  consultaChavesLogin,
  MAX_NAVEGADORES,
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

  it("sem a senha do sistema, só numa sessão recém-criada e uma vez por sessão", () => {
    const agora = Date.parse("2026-11-19T12:00:00Z");
    assert.equal(podeAutorizarSemSenha("2026-11-19T11:50:00Z", agora, false), true);
    assert.equal(podeAutorizarSemSenha("2026-11-19T11:50:00Z", agora, true), false, "uma vez por sessão");
    assert.equal(podeAutorizarSemSenha(new Date(agora - JANELA_AUTORIZACAO_MS - 1000).toISOString(), agora, false), false, "sessão antiga");
    assert.equal(podeAutorizarSemSenha("2026-11-19T12:10:00Z", agora, false), false, "data no futuro não vale");
    assert.equal(podeAutorizarSemSenha(null, agora, false), false);
    assert.equal(instanteSessao("2026-11-19 11:50:00"), Date.parse("2026-11-19T11:50:00Z"), "o formato do SQLite é UTC");
    assert.equal(instanteSessao("lixo"), null);
  });

  it("a pausa é por código, com o texto fixo do sistema", () => {
    assert.deepEqual(Object.keys(MOTIVO_PAUSA).sort(), ["recusado", "verificacao"]);
  });
});

describe("login da Centi — navegadores autorizados e importação", () => {
  it("autoriza, renova sem duplicar, poda além do teto, sabe se a sessão já autorizou e tira só o próprio", async () => {
    const db = bancoMigrado();
    const orm = drizzle(d1Sobre(db) as never, { schema });
    db.exec(`INSERT INTO usuarios (id, email, nome, senha_hash, status) VALUES (1, 'a@x', 'A', 'x', 'ativo'), (2, 'b@x', 'B', 'x', 'ativo')`);
    const autorizar = (u: number, i: number, sessaoId: number | null = null) =>
      orm.batch([...comandosAutorizarChave(orm, { usuarioId: u, impressao: `imp${i}`, publica: `pub${i}`, navegador: `Nav ${i}`, em: `2026-11-19T10:${String(i).padStart(2, "0")}:00Z`, sessaoId })]);
    await autorizar(1, 1, 99);
    await autorizar(1, 1, 99);
    assert.equal((await consultaChavesLogin(orm, 1)).length, 1, "a mesma chave não duplica");
    assert.equal((await consultaAutorizouNaSessao(orm, 1, 99)).length, 1);
    assert.equal((await consultaAutorizouNaSessao(orm, 1, 98)).length, 0);
    for (let i = 2; i <= MAX_NAVEGADORES + 2; i++) await autorizar(1, i);
    const lista = await consultaChavesLogin(orm, 1);
    assert.equal(lista.length, MAX_NAVEGADORES);
    assert.equal(lista.at(-1)?.impressao, "imp3", "os mais antigos saem");
    await autorizar(2, 1);
    assert.equal((await consultaChaveLogin(orm, 2, "imp1")).length, 1, "a mesma chave de outra pessoa é outra linha");
    const [alheia] = await consultaChaveLogin(orm, 2, "imp1");
    assert.equal((await comandoTirarChave(orm, 1, alheia.id)).length, 0, "não tira o navegador de outra pessoa");
    assert.equal((await comandoTirarChave(orm, 2, alheia.id)).length, 1);
    db.exec("DELETE FROM usuarios WHERE id = 1");
    assert.equal((await consultaChavesLogin(orm, 1)).length, 0, "a pessoa excluída leva os navegadores");
  });

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
